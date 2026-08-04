"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { X, Wrench, Siren, CheckCircle2, Clock, Loader2, Flag } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Popup "Manutenção de hoje" (pedido explícito do Felipe, 04/08/2026): ao
// clicar na flag de Manutenção (Seleção e Liberação, Atribuição Diária —
// módulo Governança), mostra os cards de Manutenção programados pra essa UH
// no dia, pra dar visibilidade rápida ao Atendimento sem precisar entrar no
// módulo de Manutenção. Mesmo padrão de modal hand-rolled usado em
// UHDetailModal.tsx (não há Dialog compartilhado em Housekeeping).
//
// onEncerrar é opcional — só passado pela Seleção e Liberação (onde já
// existe o fluxo de ligar/desligar a flag). Na Atribuição Diária a badge é
// só informativa, então o popup abre sem esse botão.

type ManutencaoCard = {
  id: string;
  itemNome: string;
  itemCategory: string | null;
  comment: string | null;
  urgente: boolean;
  prioridade: boolean;
  executionStatus: string; // PLANEJADA | EXECUTADA
  executedAt: string | null;
  canceladoPorLiberacao: boolean;
};

type ManutencaoHojeResponse = {
  programado: boolean;
  cards: ManutencaoCard[];
};

const STATUS_LABEL: Record<string, string> = {
  PLANEJADA: "Planejada para hoje",
  EXECUTADA: "Executada",
};

export default function ManutencaoHojeModal({
  uh,
  data,
  onClose,
  onEncerrar,
  encerrando,
}: {
  uh: { uhId: string; numero: string; manutencaoDescricao?: string | null };
  data: string;
  onClose: () => void;
  onEncerrar?: () => void;
  encerrando?: boolean;
}) {
  const [detail, setDetail] = useState<ManutencaoHojeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/manutencao-hoje?uhId=${uh.uhId}&data=${data}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [uh.uhId, data]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const cards = detail?.cards ?? [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 md:inset-0 z-50 flex md:items-center md:justify-center pointer-events-none">
        <div className="pointer-events-auto w-full md:max-w-lg md:mx-4 bg-white rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <div>
                <p className="font-bold text-lg text-gray-900">Manutenção — UH {uh.numero}</p>
                <p className="text-sm text-gray-500">
                  Programação de {format(new Date(`${data}T00:00:00`), "dd/MM/yyyy")}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {uh.manutencaoDescricao && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-sm text-orange-800">
                <p className="font-medium mb-0.5">Defeito reportado</p>
                <p>{uh.manutencaoDescricao}</p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : !detail?.programado ? (
              <div className="text-center py-8 text-gray-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">A programação de Manutenção de hoje ainda não foi fechada.</p>
              </div>
            ) : cards.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum card de Manutenção programado pra essa UH hoje.</p>
              </div>
            ) : (
              cards.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-xl border p-3 ${
                    c.executionStatus === "EXECUTADA"
                      ? "border-green-200 bg-green-50"
                      : "border-orange-200 bg-orange-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      {c.itemNome}
                      {c.itemCategory && <span className="text-xs text-gray-400 font-normal"> · {c.itemCategory}</span>}
                    </p>
                    {c.urgente && (
                      <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 flex-shrink-0">
                        <Siren className="w-2.5 h-2.5" /> Urgente
                      </span>
                    )}
                    {c.prioridade && (
                      <span className="flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 flex-shrink-0">
                        <Flag className="w-2.5 h-2.5" /> Prioridade
                      </span>
                    )}
                  </div>
                  {c.comment && <p className="text-xs text-gray-500 mb-1">{c.comment}</p>}
                  <p
                    className={`text-xs font-medium ${
                      c.executionStatus === "EXECUTADA" ? "text-green-600" : "text-orange-600"
                    }`}
                  >
                    {c.executionStatus === "EXECUTADA" && c.executedAt
                      ? `Executada às ${format(new Date(c.executedAt), "HH:mm")}`
                      : STATUS_LABEL[c.executionStatus] ?? c.executionStatus}
                  </p>
                  {c.canceladoPorLiberacao && (
                    <p className="text-xs text-gray-400 italic mt-0.5">
                      UH removida da programação de Governança do dia.
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {onEncerrar && (
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={onEncerrar}
                disabled={encerrando}
                className="w-full rounded-xl bg-orange-500 text-white text-sm font-medium py-2.5 hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {encerrando ? "Encerrando..." : "Encerrar manutenção"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
