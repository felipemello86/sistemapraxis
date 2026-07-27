"use client";
import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, ShieldAlert, Wrench, CircleOff, Check, X } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Tela de Decisão de Bloqueio — pedido explícito do Felipe: uma NC urgente
// não bloqueia mais a UH sozinha, só cria um pedido pendente (ver
// packages/core/src/maintenanceUrgente.ts). O mesmo padrão foi estendido pra
// marcar uma UH "Em Manutenção" (tipo=MANUTENCAO, mesmo pedido do Felipe:
// "toda Manutenção não deve ser automaticamente bloqueada [...] deve ser
// direcionado uma solicitação para o atendimento processar") — decisão
// explícita do Felipe de reaproveitar esta mesma tela em vez de criar uma
// nova só pra isso. Aqui o Atendimento (ou Gerente/Master) decide aprovar ou
// não cada pedido, dos dois tipos; Governanta só acompanha (podeOperar=false
// pra ela, ver page.tsx). Remover uma decisão já aplicada (desbloquear, ou
// encerrar manutenção) usa as mesmas ações "desbloquear"/"toggle_manutencao"
// de Seleção e Liberação (/api/selecao-uhs) — não duplicadas aqui.

type Pendente = {
  id: string;
  tipo: "BLOQUEIO" | "MANUTENCAO";
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

type EmManutencao = {
  uhId: string;
  numero: string;
  manutencaoDescricao: string | null;
  manutencaoSolicitanteNome: string | null;
  manutencaoEm: string | null;
};

function formatarData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function DecisaoBloqueioView({ podeOperar }: { podeOperar: boolean }) {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [bloqueadas, setBloqueadas] = useState<Bloqueada[]>([]);
  const [emManutencao, setEmManutencao] = useState<EmManutencao[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const data = await apiFetch("/api/decisao-bloqueio").then((r) => r.json());
    setPendentes(Array.isArray(data?.pendentes) ? data.pendentes : []);
    setBloqueadas(Array.isArray(data?.bloqueadas) ? data.bloqueadas : []);
    setEmManutencao(Array.isArray(data?.emManutencao) ? data.emManutencao : []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function decidir(requestId: string, aprovar: boolean) {
    setDecidindo(requestId);
    setErro(null);
    try {
      const res = await apiFetch("/api/decisao-bloqueio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decidir", requestId, aprovar }),
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

  // Encerrar manutenção não precisa de aprovação (só ligar precisa) — mesma
  // ação toggle_manutencao de /api/selecao-uhs, que desliga direto quando a
  // UH já está em manutenção (ver comentário na rota).
  async function encerrarManutencao(uhId: string) {
    setEncerrando(uhId);
    setErro(null);
    try {
      const res = await apiFetch("/api/selecao-uhs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_manutencao", uhId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao encerrar manutenção.");
    } finally {
      setEncerrando(null);
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
        Não conformidades urgentes e solicitações de manutenção não bloqueiam/marcam a UH sozinhas — cabe ao Atendimento decidir.
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
              <p className="py-8 text-center text-sm text-gray-400">Nenhum pedido pendente.</p>
            ) : (
              pendentes.map((p) => {
                const isManutencao = p.tipo === "MANUTENCAO";
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-3 ${isManutencao ? "border-orange-200 bg-orange-50/50" : "border-red-200 bg-red-50/50"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isManutencao ? <Wrench className="w-3.5 h-3.5 text-orange-600" /> : <ShieldAlert className="w-3.5 h-3.5 text-red-600" />}
                      <p className="text-sm font-semibold text-gray-800">
                        Unidade {p.uhNumero} · {isManutencao ? "Manutenção" : "Bloqueio"}
                      </p>
                    </div>
                    {p.itemNome && <p className="text-sm text-gray-600 mt-1">{p.itemNome}</p>}
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
                          <X className="w-4 h-4" /> {isManutencao ? "Recusar" : "Não bloquear"}
                        </button>
                        <button
                          onClick={() => decidir(p.id, true)}
                          disabled={decidindo === p.id}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
                            isManutencao ? "bg-orange-600 hover:bg-orange-700" : "bg-red-600 hover:bg-red-700"
                          }`}
                        >
                          {isManutencao ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          {isManutencao ? "Aprovar" : "Bloquear"}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-gray-400 italic">Aguardando decisão do Atendimento.</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex max-h-[36vh] flex-col rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-700">UHs bloqueadas</h2>
              <span className="text-xs text-gray-400">({bloqueadas.length})</span>
            </div>
            <div className="space-y-3 overflow-y-auto pr-1">
              {bloqueadas.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Nenhuma UH bloqueada no momento.</p>
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

          <div className="flex max-h-[36vh] flex-col rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-700">UHs em manutenção</h2>
              <span className="text-xs text-gray-400">({emManutencao.length})</span>
            </div>
            <div className="space-y-3 overflow-y-auto pr-1">
              {emManutencao.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Nenhuma UH em manutenção no momento.</p>
              ) : (
                emManutencao.map((u) => (
                  <div key={u.uhId} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                    <p className="text-sm font-semibold text-gray-800">Unidade {u.numero}</p>
                    {u.manutencaoDescricao && <p className="text-xs text-gray-500 mt-1">{u.manutencaoDescricao}</p>}
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {u.manutencaoEm && formatarData(u.manutencaoEm)}
                      {u.manutencaoSolicitanteNome ? ` · ${u.manutencaoSolicitanteNome}` : ""}
                    </p>
                    {podeOperar && (
                      <button
                        onClick={() => encerrarManutencao(u.uhId)}
                        disabled={encerrando === u.uhId}
                        className="mt-3 w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        <CircleOff className="w-4 h-4" /> {encerrando === u.uhId ? "Encerrando..." : "Encerrar manutenção"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
