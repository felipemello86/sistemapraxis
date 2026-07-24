import Anthropic from "@anthropic-ai/sdk";
import type { InsightDraft } from "./types";

// Único ponto do pipeline onde um LLM entra — e mesmo aqui, com uma
// restrição rígida: o narrador reescreve SOMENTE o campo `explanation`, a
// partir EXCLUSIVAMENTE dos fatos que o próprio detector já apurou (o campo
// `evidence`, calculado direto do banco). Ele nunca vê o banco, nunca recebe
// ferramentas, nunca pode alterar priority/confidence/evidence/
// recommendedAction — esses continuam 100% determinísticos. É essa
// separação (detector apura o fato -> narrador só reformula o texto) que
// torna "nunca invente dados" uma garantia estrutural, não uma esperança de
// que o modelo obedeça a instrução.
//
// Degrada graciosamente: sem ANTHROPIC_API_KEY configurada, ou se a chamada
// falhar por qualquer motivo, o insight segue com o texto original do
// detector — nunca bloqueia a geração por causa do narrador.

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  client = apiKey ? new Anthropic({ apiKey }) : null;
  return client;
}

const NARRATOR_MODEL = "claude-haiku-4-5-20251001";

export async function narrarInsight(draft: InsightDraft): Promise<InsightDraft> {
  const anthropic = getClient();
  if (!anthropic) return draft;

  try {
    const fatos = draft.evidence.map((e) => `- ${e.label}: ${e.value}`).join("\n") || "(sem evidência adicional)";

    const msg = await anthropic.messages.create({
      model: NARRATOR_MODEL,
      max_tokens: 300,
      system:
        "Você reescreve a explicação de um alerta operacional de um hotel em português claro, direto, " +
        "em 1 a 3 frases curtas, para um gestor sem tempo de sobra. Use ESTRITAMENTE os fatos fornecidos — " +
        "nunca invente números, datas, nomes ou causas que não estejam explicitamente listados. Nunca sugira " +
        "uma ação (isso já vem calculado à parte, não é sua tarefa). Responda somente com o texto da " +
        "explicação final, sem preâmbulo, sem aspas, sem markdown.",
      messages: [
        {
          role: "user",
          content: `Título: ${draft.title}\nExplicação original (do detector): ${draft.explanation}\nFatos:\n${fatos}`,
        },
      ],
    });

    const bloco = msg.content.find((b) => b.type === "text");
    const texto = bloco && bloco.type === "text" ? bloco.text.trim() : "";
    return texto ? { ...draft, explanation: texto } : draft;
  } catch (e) {
    console.error("[ai-engine] narrador falhou, mantendo o texto original do detector", e);
    return draft;
  }
}
