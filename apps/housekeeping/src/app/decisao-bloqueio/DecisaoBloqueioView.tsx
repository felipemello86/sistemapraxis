"use client";
import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, ShieldAlert, Check, X } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Tela de Decisão de Bloqueio — pedido explícito do Felipe: uma NC urgente
// não bloqueia mais a UH sozinha, só cria um pedido pendente (ver
// packages/core/src/maintenanceUrgente.ts). Aqui o Atendimento (ou Gerente/
// Master) decide bloquear ou não cada pedido; Governanta só acompanha
// (podeOperar=false pra ela, ver page.tsx). Remover um bloqueio já
// aplicado usa a mesma ação "desbloquear" de Seleção e Liberação
// (/api/selecao-uhs) — não duplicada aqui.

type Pendente = {
  id: string;
  uhId: string;
  uhNumero: string;
  itemNome: string | null;
  comment: string;
  solicitanteNome: string;
  createdAt: string;
};

type Bloqueada = {
  uhId: string;
  numero: string;
  bloqueioDescricao: string | null;
  bloqueioSolicitanteNome: string | null;
  bloqueioEm: string | null;
  bloqueioOrigem: string | null;
};

function formatarData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function DecisaoBloqueioView({ podeOperar }: { podeOperar: boolean }) {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [bloqueadas, setBloqueadas] = useState<Bloqueada[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const data = await apiFetch("/api/decisao-bloqueio").then((r) => r.json());
    setPendentes(Array.isArray(data?.pendentes) ? data.pendentes : []);
    setBloqueadas(Array.isArray(data?.bloqueadas) ? data.bloqueadas : []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function decidir(requestId: string, bloquear: boolean) {
    setDecidindo(requestId);
    setErro(null);
    try {
      const res = await apiFetch("/api/decisao-bloqueio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decidir", requestId, bloquear }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao decidir.");
    } finally {
      setDecidindo(null);
    }
  }

  async function desbloquear(uhId: string) {
    setDesbloqueando(uhId);
    setErro(null);
    try {
      const res = await apiFetch("/api/selecao-uhs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "desbloquear", uhId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao desbloquear.");
    } finally {
      setDesbloqueando(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Carregando...</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-6 h-6 text-red-600" />
        <h1 className="text-xl font-bold text-gray-900">Decisão de Bloqueio</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Não conformidades urgentes não bloqueiam a UH sozinhas — cabe ao Atendimento decidir se bloqueia pra reservas.
      </p>

      {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-700">Pendentes de decisão</h2>
            <span className="text-xs text-gray-400">({pendentes.length})</span>
          </div>
          <div className="space-y-3 overflow-y-auto pr-1">
            {pendentes.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Nenhum pedido de bloqueio pendente.</p>
            ) : (
              pendentes.map((p) => (
                <div key={p.id} className="rounded-xl border border-red-200 bg-red-50/50 p-3">
                  <p className="text-sm font-semibold text-gray-800">Unidade {p.uhNumero}</p>
                  {p.itemNome && <p className="text-sm text-gray-600">{p.itemNome}</p>}
                  <p className="text-xs text-gray-500 mt-1">{p.comment}</p>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    {formatarData(p.createdAt)} · relatado por {p.solicitanteNome}
                  </p>
                  {podeOperar ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => decidir(p.id, false)}
                        disabled={decidindo === p.id}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> Não bloquear
                      </button>
                      <button
                        onClick={() => decidir(p.id, true)}
                        disabled={decidindo === p.id}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                      >
                        <Lock className="w-4 h-4" /> Bloquear
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-gray-400 italic">Aguardando decisão do Atendimento.</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-700">UHs bloqueadas</h2>
            <span className="text-xs text-gray-400">({bloqueadas.length})</span>
          </div>
          <div className="space-y-3 overflow-y-auto pr-1">
            {bloqueadas.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Nenhuma UH bloqueada no momento.</p>
            ) : (
              bloqueadas.map((u) => (
                <div key={u.uhId} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                  <p className="text-sm font-semibold text-gray-800">Unidade {u.numero}</p>
                  {u.bloqueioDescricao && <p className="text-xs text-gray-500 mt-1">{u.bloqueioDescricao}</p>}
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    {u.bloqueioEm && formatarData(u.bloqueioEm)}
                    {u.bloqueioSolicitanteNome ? ` · ${u.bloqueioSolicitanteNome}` : ""}
                  </p>
                  {podeOperar && (
                    <button
                      onClick={() => desbloquear(u.uhId)}
                      disabled={desbloqueando === u.uhId}
                      className="mt-3 w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Unlock className="w-4 h-4" /> {desbloqueando === u.uhId ? "Desbloqueando..." : "Desbloquear"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
