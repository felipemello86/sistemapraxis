"use client";
import { useEffect, useState } from "react";
import { Landmark, PlusCircle, RefreshCw } from "lucide-react";
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

const PLUGGY_CONNECT_SCRIPT = "https://cdn.pluggy.ai/pluggy-connect/v2.9.0/pluggy-connect.js";

type ContaBancaria = { id: string; nome: string; tipo: string; saldoAtual: string | null; limiteCredito: string | null };
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

export function ContasView() {
  const [pluggyConfigurado, setPluggyConfigurado] = useState<boolean | null>(null);
  const [contasConectadas, setContasConectadas] = useState<ContaConectada[]>([]);
  const [loading, setLoading] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState("");

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
        onError: (err) => setErro(String(err)),
      });
      widget.init();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setConectando(false);
    }
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

          <button onClick={conectarConta} disabled={conectando} className="btn-primary flex items-center gap-1.5 text-sm">
            <PlusCircle className="w-4 h-4" /> {conectando ? "Abrindo..." : "Conectar conta ou cartão"}
          </button>

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
                        <div key={c.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{c.nome}</span>
                          <span className="text-gray-900 font-medium">{formatBRL(c.tipo === "CREDIT" ? c.limiteCredito : c.saldoAtual)}</span>
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
