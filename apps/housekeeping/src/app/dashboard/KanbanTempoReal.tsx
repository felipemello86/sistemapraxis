"use client";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Wrench, Flag } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import UHDetailModal from "@/components/UHDetailModal";

// Kanban da tela "Tempo Real" — subtela padrão (ver TempoRealTabs.tsx),
// pedido do Felipe (05/08/2026): visão em quadro das UHs do dia, colunas "A
// Liberar / Liberado / Em Andamento / Inspeção / Check-in Liberado", com
// balloons de progresso por camareira acima. Reaproveita a mesma rota
// GET /api/atribuicoes já usada pela tela Atribuição Diária (mesmo status
// PENDENTE|LIBERADO|EM_ANDAMENTO|CONCLUIDO|INSPECIONADO já mantido lá) em vez
// de criar um endpoint novo — garante que as duas telas nunca divirjam sobre
// o estado de uma UH.

// ── Types ────────────────────────────────────────────────────────────────────
type UH = { id: string; numero: string; emManutencao: boolean };
type CamareiraInfo = { id: string; nome: string; foto: string | null };
type Assignment = {
  id: string;
  status: string;
  liberadaEm: string | null;
  uh: UH;
  camareira: CamareiraInfo;
  cleaningSession: {
    iniciadaEm: string;
    finalizadaEm: string | null;
    inspection: { finalizadaEm: string | null } | null;
  } | null;
};

type EventoEtapa = { tipo: "L" | "I" | "T" | "C"; timestamp: string };

type UhCard = {
  uhId: string;
  uhNumero: string;
  emManutencao: boolean;
  status: string;
  enteredAt: string | null;
  eventos: EventoEtapa[];
  camareiras: CamareiraInfo[];
  representativeAssignmentId: string;
};

// ── Constantes ───────────────────────────────────────────────────────────────
// Mesmo mapeamento de cor já usado em AtribuicaoView (STATUS_LABELS) — só os
// rótulos de coluna mudam aqui pra bater com o vocabulário pedido pelo
// Felipe pra esta tela específica ("A Liberar" em vez de "Bloqueada",
// "Inspeção" em vez de "Concluída", "Check-in Liberado" em vez de
// "Inspecionada").
const COLUNAS: { status: string; label: string; dot: string; header: string }[] = [
  { status: "PENDENTE", label: "A Liberar", dot: "#9ca3af", header: "bg-gray-50 text-gray-600" },
  { status: "LIBERADO", label: "Liberado", dot: "#eab308", header: "bg-yellow-50 text-yellow-700" },
  { status: "EM_ANDAMENTO", label: "Em Andamento", dot: "#3b82f6", header: "bg-blue-50 text-blue-700" },
  { status: "CONCLUIDO", label: "Inspeção", dot: "#10b981", header: "bg-green-50 text-green-700" },
  { status: "INSPECIONADO", label: "Check-in Liberado", dot: "#8b5cf6", header: "bg-purple-50 text-purple-700" },
];
const STATUS_RANK: Record<string, number> = { PENDENTE: 0, LIBERADO: 1, EM_ANDAMENTO: 2, CONCLUIDO: 3, INSPECIONADO: 4 };
const GLOBAL_COR = "#6366f1";
const CAM_PALETTE = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#ec4899", "#a855f7"];
// Mesma paleta por tipo de evento já usada na legenda do Burndown
// (TIPO_COR em BurndownChart.tsx) — reaproveitada aqui pra quem já conhece
// aquela tela reconhecer L/I/T/C de cara.
const TIPO_COR: Record<EventoEtapa["tipo"], string> = {
  L: "#3b82f6", I: "#f59e0b", T: "#8b5cf6", C: "#10b981",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getEnteredAt(a: Assignment): string | null {
  switch (a.status) {
    case "LIBERADO": return a.liberadaEm;
    case "EM_ANDAMENTO": return a.cleaningSession?.iniciadaEm ?? null;
    case "CONCLUIDO": return a.cleaningSession?.finalizadaEm ?? null;
    case "INSPECIONADO": return a.cleaningSession?.inspection?.finalizadaEm ?? null;
    default: return null;
  }
}

// Horários de TODAS as etapas já percorridas (não só a atual) — pedido do
// Felipe (05/08/2026). L vem de DailyAssignment.liberadaEm direto (mesmo
// campo usado no card em mutirão, sincronizado pra todas as atribuições da
// UH — ver liberacao-automatica.ts), os demais da CleaningSession/
// InspectionSession da atribuição representante do card.
function buildEventos(a: Assignment): EventoEtapa[] {
  const evs: EventoEtapa[] = [];
  if (a.liberadaEm) evs.push({ tipo: "L", timestamp: a.liberadaEm });
  if (a.cleaningSession?.iniciadaEm) evs.push({ tipo: "I", timestamp: a.cleaningSession.iniciadaEm });
  if (a.cleaningSession?.finalizadaEm) evs.push({ tipo: "T", timestamp: a.cleaningSession.finalizadaEm });
  if (a.cleaningSession?.inspection?.finalizadaEm) evs.push({ tipo: "C", timestamp: a.cleaningSession.inspection.finalizadaEm });
  return evs;
}

// Agrupa DailyAssignment por UH — numa "Super Limpeza a duas"/mutirão pode
// haver mais de uma linha pra mesma UH/dia (ver comentário no schema,
// DailyAssignment.@@unique). O card representa a UH inteira, não a
// atribuição individual: usa o status mais avançado do grupo pra decidir a
// coluna (se uma camareira já terminou e a outra ainda está limpando, a UH
// como um todo já "está em andamento", não mais "liberada"), e empilha as
// fotos de todas as camareiras envolvidas.
function buildUhCards(assignments: Assignment[]): UhCard[] {
  const byUh = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const arr = byUh.get(a.uh.id) ?? [];
    arr.push(a);
    byUh.set(a.uh.id, arr);
  }
  const cards: UhCard[] = [];
  for (const group of byUh.values()) {
    const rep = group.reduce((best, cur) =>
      (STATUS_RANK[cur.status] ?? 0) > (STATUS_RANK[best.status] ?? 0) ? cur : best, group[0]);
    cards.push({
      uhId: rep.uh.id,
      uhNumero: rep.uh.numero,
      emManutencao: rep.uh.emManutencao,
      status: rep.status,
      enteredAt: getEnteredAt(rep),
      eventos: buildEventos(rep),
      camareiras: group.map((a) => a.camareira),
      representativeAssignmentId: rep.id,
    });
  }
  cards.sort((a, b) => a.uhNumero.localeCompare(b.uhNumero, undefined, { numeric: true }));
  return cards;
}

function Avatar({ nome, foto, className }: { nome: string; foto?: string | null; className: string }) {
  if (foto) return <img src={foto} alt={nome} className={`${className} object-cover`} />;
  return (
    <div className={`${className} bg-blue-100 text-blue-700 font-bold flex items-center justify-center`}>
      {nome[0]?.toUpperCase()}
    </div>
  );
}

// ── Balloon de progresso (Global ou por camareira) ────────────────────────────
// Clicável — filtra o quadro pra só as UHs da camareira clicada (pedido do
// Felipe, 05/08/2026). "Global" sempre limpa o filtro (é o único jeito de
// voltar a ver todo mundo, já que clicar de novo na camareira selecionada
// também limpa — mesmo padrão de toggle do BurndownChart).
function ProgressoBalloon({
  label, foto, cor, concluidas, total, horarioFim, selected, onClick,
}: {
  label: string; foto?: string | null; cor: string; concluidas: number; total: number; horarioFim: string | null;
  selected: boolean; onClick: () => void;
}) {
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
  const concluido = total > 0 && concluidas === total;
  const iniciais = label.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 shadow-sm border-2 transition-shadow ${concluido ? "bg-green-600 border-green-600" : "bg-white"}`}
      style={{
        borderColor: concluido ? undefined : cor,
        boxShadow: selected ? `0 0 0 3px ${cor}55` : undefined,
      }}
    >
      <div
        className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: concluido ? "rgba(255,255,255,0.25)" : cor + "20" }}
      >
        {foto ? (
          <img src={foto} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold" style={{ color: concluido ? "white" : cor }}>{iniciais}</span>
        )}
      </div>
      <div className="flex flex-col leading-none">
        <span className={`text-xs font-semibold truncate max-w-[90px] ${concluido ? "text-white" : "text-gray-700"}`}>{label}</span>
        <span className={`text-xs font-bold mt-0.5 inline-flex items-center gap-1 ${concluido ? "text-white" : "text-gray-500"}`}>
          {concluido && horarioFim
            ? <><Flag className="w-3 h-3" />{horarioFim}</>
            : `${concluidas}/${total} · ${pct}%`}
        </span>
      </div>
    </button>
  );
}

// ── Card de UH no quadro ───────────────────────────────────────────────────────
function UhCardView({ card, onClick }: { card: UhCard; onClick: () => void }) {
  const mutirao = card.camareiras.length > 1;
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-2.5 hover:shadow-md hover:border-gray-300 transition-shadow"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-gray-900 text-sm flex items-center gap-1">
          {card.uhNumero}
          {card.emManutencao && <Wrench className="w-3 h-3 text-orange-500" />}
        </span>
        <div className="flex -space-x-1.5">
          {card.camareiras.slice(0, 3).map((c) => (
            <Avatar key={c.id} nome={c.nome} foto={c.foto} className="w-6 h-6 rounded-full text-[10px] border-2 border-white flex-shrink-0" />
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1 truncate">
        {card.camareiras.map((c) => c.nome.split(" ")[0]).join(mutirao ? " + " : "")}
      </p>
      {/* Horário de todas as etapas já percorridas, não só a atual — pedido
          do Felipe (05/08/2026). Mesmas letras/cores da legenda do Burndown
          (L/I/T/C). */}
      {card.eventos.length > 0 && (
        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 mt-1.5">
          {card.eventos.map((e) => (
            <span key={e.tipo} className="text-[10px] font-semibold" style={{ color: TIPO_COR[e.tipo] }}>
              {e.tipo} {format(new Date(e.timestamp), "HH:mm")}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function KanbanTempoReal({ role, podeOperar }: { role: string; podeOperar: boolean }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSel, setDataSel] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [detalheAssignmentId, setDetalheAssignmentId] = useState<string | null>(null);
  // Filtro por camareira — clicar num balloon mostra só as UHs dela (pedido
  // do Felipe, 05/08/2026). Clicar de novo na mesma, ou em "Global", limpa.
  const [filtroCamareiraId, setFiltroCamareiraId] = useState<string | null>(null);

  const hojeStr = new Date().toLocaleDateString("en-CA");
  const isHoje = dataSel === hojeStr;

  const navegarData = (delta: number) => {
    const d = new Date(dataSel + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDataSel(d.toLocaleDateString("en-CA"));
  };

  const carregar = useCallback(() => {
    apiFetch(`/api/atribuicoes?data=${dataSel}`)
      .then((r) => r.json())
      .then((d) => { setAssignments(Array.isArray(d) ? d : []); setLoading(false); });
  }, [dataSel]);

  useEffect(() => {
    setLoading(true);
    carregar();
    if (isHoje) {
      const id = setInterval(carregar, 60_000);
      return () => clearInterval(id);
    }
  }, [carregar, isHoje]);

  const dateFmt = format(new Date(dataSel + "T12:00:00"), "dd/MM/yyyy");
  const cards = buildUhCards(assignments);

  // ── Balloons: Global + por camareira ────────────────────────────────────────
  // "Concluída" aqui = Check-in Liberado (INSPECIONADO), mesmo critério do
  // Burndown ("C" — o mais avançado dos 4 eventos). O balloon Global soma
  // UHs (não atribuições) — mesmo cuidado de mutirão do /api/burndown, pra
  // não inflar o denominador quando 2 camareiras trabalham na mesma UH.
  const totalGlobal = cards.length;
  const concluidasGlobal = cards.filter((c) => c.status === "INSPECIONADO").length;
  const horarioFimGlobal = totalGlobal > 0 && concluidasGlobal === totalGlobal
    ? cards
        .map((c) => c.enteredAt)
        .filter((t): t is string => !!t)
        .reduce<string | null>((latest, t) => (!latest || t > latest ? t : latest), null)
    : null;

  const porCamareira = new Map<string, { info: CamareiraInfo; total: number; concluidas: number; ultimoFim: string | null }>();
  for (const a of assignments) {
    const cur = porCamareira.get(a.camareira.id) ?? { info: a.camareira, total: 0, concluidas: 0, ultimoFim: null };
    cur.total++;
    if (a.status === "INSPECIONADO") {
      cur.concluidas++;
      const fim = a.cleaningSession?.inspection?.finalizadaEm ?? null;
      if (fim && (!cur.ultimoFim || fim > cur.ultimoFim)) cur.ultimoFim = fim;
    }
    porCamareira.set(a.camareira.id, cur);
  }
  const camareirasBalloons = Array.from(porCamareira.values()).sort((a, b) => a.info.nome.localeCompare(b.info.nome));

  // Balloons refletem sempre o dia inteiro (não filtram a si mesmos) — só o
  // quadro abaixo é filtrado, pra continuar dando visão geral de todo mundo
  // mesmo com uma camareira selecionada.
  const cardsFiltrados = filtroCamareiraId
    ? cards.filter((c) => c.camareiras.some((cam) => cam.id === filtroCamareiraId))
    : cards;

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Carregando...</div>;
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => navegarData(-1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={dataSel} max={hojeStr} onChange={(e) => setDataSel(e.target.value)}
            className="input w-auto text-base py-1.5" />
          <button onClick={() => navegarData(1)} disabled={isHoje}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400 ml-1">{dateFmt}</span>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="card flex-1 flex flex-col items-center justify-center text-gray-400">
          <p className="text-lg font-medium">Nenhuma UH atribuída</p>
          <p className="text-sm mt-1">{dateFmt}</p>
        </div>
      ) : (
        <>
          {/* Balloons — Global à esquerda, depois cada camareira, lado a lado */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <ProgressoBalloon
              label="Global" cor={GLOBAL_COR}
              concluidas={concluidasGlobal} total={totalGlobal} horarioFim={horarioFimGlobal ? format(new Date(horarioFimGlobal), "HH:mm") : null}
              selected={filtroCamareiraId === null}
              onClick={() => setFiltroCamareiraId(null)}
            />
            {camareirasBalloons.map((c, i) => (
              <ProgressoBalloon
                key={c.info.id}
                label={c.info.nome.split(" ")[0]}
                foto={c.info.foto}
                cor={CAM_PALETTE[i % CAM_PALETTE.length]}
                concluidas={c.concluidas}
                total={c.total}
                horarioFim={c.ultimoFim ? format(new Date(c.ultimoFim), "HH:mm") : null}
                selected={filtroCamareiraId === c.info.id}
                onClick={() => setFiltroCamareiraId((prev) => (prev === c.info.id ? null : c.info.id))}
              />
            ))}
          </div>

          {/* Quadro — 5 colunas */}
          <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-1">
            {COLUNAS.map((col) => {
              const colCards = cardsFiltrados.filter((c) => c.status === col.status);
              return (
                <div key={col.status} className="flex flex-col min-w-[220px] w-[220px] shrink-0 bg-gray-50 rounded-lg border border-gray-200 min-h-0">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg shrink-0 ${col.header}`}>
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: col.dot }} />
                      {col.label}
                    </span>
                    <span className="text-xs font-bold">{colCards.length}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                    {colCards.length === 0 ? (
                      <p className="text-xs text-gray-300 text-center py-4">—</p>
                    ) : (
                      colCards.map((c) => (
                        <UhCardView key={c.uhId} card={c} onClick={() => setDetalheAssignmentId(c.representativeAssignmentId)} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {detalheAssignmentId && (
        <UHDetailModal
          assignmentId={detalheAssignmentId}
          onClose={() => setDetalheAssignmentId(null)}
        />
      )}
    </div>
  );
}
