"use client";
import { useEffect, useState } from "react";
import { Landmark, PlusCircle, RefreshCw, Pencil, Check } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Contas conectadas via Pluggy (requisito 6/10) — Unicred Conta Corrente,
// Unicred Visa, Cartão Carrefour, Cartão Riachuelo. BLOQUEADO até o Felipe
// criar a conta em dashboard.pluggy.ai e gerar Client ID + Client Secret
// (ver pluggy.ts); enquanto isso, esta tela mostra o passo a passo em vez
// de um botão quebrado.

declare global {
  interface Window {
    PluggyConnect?: new (opts: { connectToken: string; includeSandbox?: boolean; onSuccess: (data: { item: { id: string } }) => void; onError?: (err: unknown) => void }) => { init: () => void };
  }
}

// "latest" em vez de fixar um número de versão — confirmado em
// docs.pluggy.ai/docs/setup-pluggyconnect-widget-on-your-app (05/08/2026)
// que a Pluggy publica esse alias, evitando o script apontar pra uma
// versão que pode deixar de existir no CDN deles.
const PLUGGY_CONNECT_SCRIPT = "https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js";

type ContaBancaria = { id: string; nome: string; apelido: string | null; tipo: string; saldoAtual: string | null; limiteCredito: string | null };
type ContaConectada = { id: string; instituicao: string; status: string; ultimaSincronizacaoEm: string | null; contas: ContaBancaria[] };

function formatBRL(v: string | number | null): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  UPDATED: { label: "Sincronizada", cor: "text-green-700 bg-green-50" },
  LOGIN_IN_PROGRESS: { label: "Conectando...", cor: "text-blue-700 bg-blue-50" },
  UPDATING: { label: "Atualizando...", cor: "text-blue-700 bg-blue-50" },
  LOGIN_ERROR: { label: "Precisa reconectar", cor: "text-red-700 bg-red-50" },
  OUTDATED: { label: "Desatualizada", cor: "text-amber-700 bg-amber-50" },
  WAITING_USER_INPUT: { label: "Aguardando confirmação", cor: "text-amber-700 bg-amber-50" },
};

// Apelido editável por conta/cartão (pedido do Felipe, 07/08/2026): clique
// no lápis pra editar inline; salva no blur/Enter, "" limpa o apelido
// (volta a mostrar o nome original da Pluggy). Mesmo padrão de DiaInput em
// configuracoes/cartoes/CartoesView.tsx.
function ApelidoInput({ valorInicial, placeholder, onSalvar }: { valorInicial: string | null; placeholder: string; onSalvar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorInicial ?? "");
  const [salvo, setSalvo] = useState(false);
  useEffect(() => setValor(valorInicial ?? ""), [valorInicial]);

  function confirmar() {
    setEditando(false);
    if (valor.trim() !== (valorInicial ?? "")) {
      onSalvar(valor.trim());
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
    }
  }

  if (editando) {
    return (
      <input
        autoFocus
        className="input text-sm py-1 px-2 w-40"
        placeholder={placeholder}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirmar();
          if (e.key === "Escape") {
            setValor(valorInicial ?? "");
            setEditando(false);
          }
        }}
      />
    );
  }

  return (
    <button onClick={() => setEditando(true)} className="text-gray-300 hover:text-gray-600 flex-shrink-0" title="Editar apelido">
      {salvo ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Pencil className="w-3.5 h-3.5" />}
    </button>
  );
}

export function ContasView() {
  const [pluggyConfigurado, setPluggyConfigurado] = useState<boolean | null>(null);
  const [contasConectadas, setContasConectadas] = useState<ContaConectada[]>([]);
  const [loading, setLoading] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultadoSync, setResultadoSync] = useState("");

  async function carregar() {
    setLoading(true);
    const res = await apiFetch("/api/contas");
    if (res.ok) {
      const data = await res.json();
      setPluggyConfigurado(data.pluggyConfigurado);
      setContasConectadas(data.contasConectadas);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function carregarScriptPluggy(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.PluggyConnect) return resolve();
      const script = document.createElement("script");
      script.src = PLUGGY_CONNECT_SCRIPT;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Não foi possível carregar o widget da Pluggy."));
      document.body.appendChild(script);
    });
  }

  async function conectarConta() {
    setErro("");
    setConectando(true);
    try {
      const resToken = await apiFetch("/api/contas/connect-token", { method: "POST", body: JSON.stringify({}) });
      if (!resToken.ok) {
        const data = await resToken.json().catch(() => ({}));
        setErro(data.error || "Erro ao gerar token de conexão.");
        return;
      }
      const { accessToken } = await resToken.json();

      await carregarScriptPluggy();
      const widget = new window.PluggyConnect!({
        connectToken: accessToken,
        onSuccess: async (data) => {
          await apiFetch("/api/contas/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: data.item.id }),
          });
          carregar();
        },
        // A Pluggy manda objetos de erro em formatos variados (Error, string,
        // ou objeto { message, code, data } — ver docs.pluggy.ai) — String()
        // sozinho vira "[object Object]" pra qualquer um que não seja Error
        // ou string. Tenta achar uma mensagem legível antes de desistir.
        onError: (err: any) => {
          const mensagem = typeof err === "string" ? err : err?.message || err?.data?.message || JSON.stringify(err);
          setErro(mensagem || "Erro desconhecido ao conectar.");
        },
      });
      widget.init();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setConectando(false);
    }
  }

  // Força uma sincronização imediata (pedido do Felipe, 06/08/2026: "como
  // faço pra forçar uma nova coleta de dados?" — antes disso só rolava pelo
  // cron diário às 11h UTC ou quando a própria Pluggy mandava um webhook de
  // transação nova). Chama a mesma função do cron/webhook, que já é
  // idempotente — clicar de novo não duplica nada, só não traz nada de
  // novo se a Pluggy ainda não tiver nada de novo do lado dela.
  async function sincronizarAgora() {
    setErro("");
    setResultadoSync("");
    setSincronizando(true);
    try {
      const res = await apiFetch("/api/contas/sincronizar", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error || "Erro ao sincronizar.");
        return;
      }
      setResultadoSync(data.novos > 0 ? `${data.novos} lançamento${data.novos !== 1 ? "s" : ""} novo${data.novos !== 1 ? "s" : ""} importado${data.novos !== 1 ? "s" : ""}.` : "Nenhum lançamento novo — já estava tudo em dia.");
      carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSincronizando(false);
    }
  }

  // Salva o apelido de uma conta/cartão (pedido do Felipe, 07/08/2026).
  async function salvarApelido(contaBancariaId: string, apelido: string) {
    await apiFetch("/api/contas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contaBancariaId, apelido }) });
    carregar();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Contas conectadas</h1>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : pluggyConfigurado === false ? (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <Landmark className="w-5 h-5" /> Ainda não configurado
          </div>
          <p className="text-sm text-gray-600">
            Pra conectar a conta corrente e os cartões (Unicred, Carrefour, Riachuelo) direto por aqui, falta criar uma conta gratuita na Pluggy e
            gerar as credenciais:
          </p>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>
              Acesse{" "}
              <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer" className="text-blue-700 underline">
                dashboard.pluggy.ai
              </a>{" "}
              e crie uma conta.
            </li>
            <li>No painel, gere um Client ID e um Client Secret.</li>
            <li>
              Defina <code className="bg-gray-100 px-1 rounded">PLUGGY_CLIENT_ID</code> e{" "}
              <code className="bg-gray-100 px-1 rounded">PLUGGY_CLIENT_SECRET</code> nas variáveis de ambiente deste app na Vercel.
            </li>
          </ol>
          <p className="text-xs text-gray-400">Até lá, os lançamentos continuam funcionando normalmente pelo cadastro manual em Lançamentos.</p>
        </div>
      ) : (
        <>
          {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
          {resultadoSync && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{resultadoSync}</p>}

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={conectarConta} disabled={conectando} className="btn-primary flex items-center gap-1.5 text-sm">
              <PlusCircle className="w-4 h-4" /> {conectando ? "Abrindo..." : "Conectar conta ou cartão"}
            </button>
            {contasConectadas.length > 0 && (
              <button
                onClick={sincronizarAgora}
                disabled={sincronizando}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 rounded-lg px-3 py-2"
              >
                <RefreshCw className={`w-4 h-4 ${sincronizando ? "animate-spin" : ""}`} /> {sincronizando ? "Sincronizando..." : "Sincronizar agora"}
              </button>
            )}
          </div>

          {contasConectadas.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma conta conectada ainda.</p>
          ) : (
            <div className="space-y-2">
              {contasConectadas.map((cc) => {
                const status = STATUS_LABEL[cc.status] ?? { label: cc.status, cor: "text-gray-600 bg-gray-100" };
                return (
                  <div key={cc.id} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900">{cc.instituicao}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cor}`}>{status.label}</span>
                    </div>
                    <div className="space-y-1.5">
                      {cc.contas.map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-sm gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="min-w-0">
                              <span className="text-gray-700 truncate block">{c.apelido || c.nome}</span>
                              {c.apelido && <span className="text-xs text-gray-400 truncate block">{c.nome}</span>}
                            </div>
                            <ApelidoInput valorInicial={c.apelido} placeholder={c.nome} onSalvar={(v) => salvarApelido(c.id, v)} />
                          </div>
                          <span className="text-gray-900 font-medium flex-shrink-0">{formatBRL(c.tipo === "CREDIT" ? c.limiteCredito : c.saldoAtual)}</span>
                        </div>
                      ))}
                    </div>
                    {cc.ultimaSincronizacaoEm && (
                      <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Última sincronização: {new Date(cc.ultimaSincronizacaoEm).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
