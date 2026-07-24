import Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS, executeChatTool, type ChatToolContext } from "./tools";

// Loop de tool-use do chat da Central de Inteligência. Diferente do
// narrador (que só reescreve texto já apurado), aqui o modelo TEM acesso a
// ferramentas de consulta real — mas sempre escopadas por tenantId/userId
// injetados pelo servidor (ver ChatToolContext), nunca fornecidos por ele.
// A única escrita possível (propor_regra) nasce sempre inativa — ver
// tools.ts. Sem tools de ação (nada de "marcar como resolvido", "executar
// card" etc.) — o chat só informa e propõe monitoramento, não opera o
// sistema.
//
// Diferente do narrador, aqui a ANTHROPIC_API_KEY é obrigatória — o chat
// não tem uma versão "sem LLM" que faça sentido, então retorna uma
// mensagem explicando isso em vez de tentar rodar sem cliente.

export interface ChatTurnResult {
  resposta: string;
  toolCalls: { name: string; input: Record<string, unknown> }[];
}

const CHAT_MODEL = "claude-sonnet-5";
const MAX_TOOL_ITERATIONS = 6;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

// Qualquer falha na chamada à API (sem crédito, chave inválida, rate limit,
// indisponibilidade momentânea) precisa virar uma resposta de chat normal,
// nunca uma exceção não tratada — isso derrubaria a Server Action inteira
// e quebraria a página (Application error), não só a resposta do chat.
function mensagemErroAmigavel(e: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = e as any;
  const status = err?.status;
  const mensagemApi = String(err?.error?.error?.message ?? err?.message ?? "");

  if (status === 400 && mensagemApi.toLowerCase().includes("credit balance")) {
    return (
      "O chat está indisponível no momento porque a conta da Anthropic está sem crédito. Peça pra quem " +
      "administra o sistema verificar o billing em console.anthropic.com."
    );
  }
  if (status === 401) {
    return (
      "O chat está indisponível: a chave da API (ANTHROPIC_API_KEY) parece inválida ou expirada. Peça pra " +
      "quem administra o sistema conferir essa configuração na Vercel."
    );
  }
  if (status === 429) {
    return "O chat está temporariamente sobrecarregado (limite de uso atingido) — tenta de novo em alguns instantes.";
  }
  return "Não consegui me conectar à IA agora. Tenta de novo em alguns instantes.";
}

const SYSTEM_PROMPT =
  "Você é o assistente da Central de Inteligência da Praxis, uma plataforma operacional de hotel. " +
  "Responda SEMPRE em português, de forma direta e objetiva. " +
  "Você tem ferramentas de consulta real aos dados do hotel (métricas por UH, insights recentes, NCs " +
  "abertas, falhas gerenciais pendentes) — use-as sempre que a pergunta depender de dado real, NUNCA " +
  "responda sobre o estado do hotel sem antes consultar uma ferramenta. Se não tiver uma ferramenta que " +
  "cubra o que foi perguntado, diga isso claramente em vez de inventar uma resposta. " +
  "Se o usuário pedir pra ser avisado de alguma condição no futuro ('me avisa quando...', 'quero saber " +
  "se...'), primeiro confirme com ele o que exatamente quer monitorar e qual limiar faz sentido, depois " +
  "use listar_metricas pra achar a métrica certa, e só então use propor_regra. Deixe claro que a regra " +
  "nasce como rascunho e precisa ser confirmada na tela antes de valer.";

export async function runChatTurn(params: {
  tenantId: string;
  userId: string;
  historico: { role: "user" | "assistant"; content: string }[];
  novaMensagem: string;
}): Promise<ChatTurnResult> {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      resposta:
        "O chat ainda não está configurado neste ambiente (falta a ANTHROPIC_API_KEY). Peça pra quem " +
        "administra o sistema configurar essa variável de ambiente no projeto gateway na Vercel.",
      toolCalls: [],
    };
  }

  const ctx: ChatToolContext = { tenantId: params.tenantId, userId: params.userId };

  // Construído como array solto (não tipado contra Anthropic.MessageParam)
  // e passado via `as any` na chamada abaixo — mesma decisão de baixo
  // acoplamento do narrator.ts, só que mais necessária aqui: o histórico
  // mistura texto simples, blocos de conteúdo devolvidos pela API e blocos
  // de tool_result, formas heterogêneas demais pra valer a pena replicar os
  // tipos exatos do SDK aqui.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...params.historico.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: params.novaMensagem },
  ];

  const toolCallsRealizadas: { name: string; input: Record<string, unknown> }[] = [];

  try {
    for (let iteracao = 0; iteracao < MAX_TOOL_ITERATIONS; iteracao++) {
      const response = await anthropic.messages.create(
        {
          model: CHAT_MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: CHAT_TOOLS,
          messages,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      );

      const conteudo: any[] = response.content;
      const blocosToolUse = conteudo.filter((b) => b.type === "tool_use");

      if (blocosToolUse.length === 0) {
        const texto = conteudo.find((b) => b.type === "text");
        const respostaFinal = texto ? String(texto.text ?? "").trim() : "";
        return {
          resposta: respostaFinal || "Não consegui formular uma resposta — tenta reformular a pergunta?",
          toolCalls: toolCallsRealizadas,
        };
      }

      // Assistente pediu ferramenta(s) — executa cada uma e devolve o
      // resultado antes de deixar o modelo continuar.
      messages.push({ role: "assistant", content: response.content });

      const resultadosFerramentas = [];
      for (const bloco of blocosToolUse) {
        if (bloco.type !== "tool_use") continue;
        const input = (bloco.input ?? {}) as Record<string, unknown>;
        toolCallsRealizadas.push({ name: bloco.name, input });
        let resultado: unknown;
        try {
          resultado = await executeChatTool(ctx, bloco.name, input);
        } catch (e) {
          resultado = { erro: e instanceof Error ? e.message : String(e) };
        }
        resultadosFerramentas.push({
          type: "tool_result",
          tool_use_id: bloco.id,
          content: JSON.stringify(resultado),
        });
      }
      messages.push({ role: "user", content: resultadosFerramentas });
    }

    return {
      resposta: "A conversa ficou complexa demais pra eu resolver numa resposta só — pode tentar de novo, de forma mais direta?",
      toolCalls: toolCallsRealizadas,
    };
  } catch (e) {
    console.error("[ai-engine] chat: falha ao chamar a API da Anthropic", e);
    return {
      resposta: mensagemErroAmigavel(e),
      toolCalls: toolCallsRealizadas,
    };
  }
}
