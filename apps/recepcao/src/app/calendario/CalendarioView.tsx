"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { format, parseISO, addDays as addDaysFns } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Ban } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Calendário dia x UH (Gantt de estadia) — visualização alternativa à lista
// simples de /reservas, mesmo dado (Reserva + BloqueioDisponibilidade),
// ainda Fase 1 (só leitura): clicar num slot abre um popup com os dados,
// não tem criar/editar/mover reserva por aqui.
//
// Layout com CSS Grid puro: 1 grid só pra tudo (cabeçalho de mês, cabeçalho
// de dia, linhas de property/UH e os eventos), usando gridColumn/gridRow
// explícitos pra posicionar cada evento na UH e no intervalo de dias certos.
// Cabeçalho (linhas 1-2) e coluna de rótulo (coluna 1) usam position:sticky
// pra ficar fixos enquanto rola o resto.

const DAY_COL_PX = 44;
const LABEL_COL_PX = 220;
const ROW1_H = 26;
const ROW2_H = 40;
const UH_ROW_H = 52;
const DIAS_VISIVEIS = 21;

type UhResumo = { id: string; numero: string; tipo: string };
type PropertyGroup = { id: string; nome: string; uhs: UhResumo[] };

type EventoReserva = {
  id: string;
  tipo: "RESERVA";
  uhId: string;
  checkIn: string;
  checkOut: string;
  canal: "DIRETO" | "AIRBNB" | "BOOKING" | "OUTRO";
  status: string;
  hospedeNome: string;
  hospedeTelefone: string | null;
};
type EventoBloqueio = {
  id: string;
  tipo: "BLOQUEIO";
  uhId: string;
  checkIn: string;
  checkOut: string;
  motivo: string;
  descricao: string | null;
  criadoPorNome: string;
};
type Evento = EventoReserva | EventoBloqueio;

type CalendarioResponse = { inicio: string; fim: string; properties: PropertyGroup[]; eventos: Evento[] };

const CANAL_LABEL: Record<string, string> = {
  DIRETO: "Direto",
  AIRBNB: "Airbnb",
  BOOKING: "Booking.com",
  OUTRO: "Outro canal",
};
const CANAL_BADGE: Record<string, { bg: string; letra: string }> = {
  DIRETO: { bg: "bg-emerald-600", letra: "D" },
  AIRBNB: { bg: "bg-rose-500", letra: "A" },
  BOOKING: { bg: "bg-blue-700", letra: "B" },
  OUTRO: { bg: "bg-gray-500", letra: "O" },
};
const MOTIVO_LABEL: Record<string, string> = {
  MANUTENCAO: "Bloqueio de manutenção",
  USO_INTERNO: "Bloqueio — uso interno",
  OUTRO: "Bloqueio — outro motivo",
};

function fmt(iso: string) {
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}
function diffDays(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
function addDays(iso: string, n: number) {
  return format(addDaysFns(parseISO(iso), n), "yyyy-MM-dd");
}

export function CalendarioView() {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [inicio, setInicio] = useState(() => addDays(hoje, -1));
  const [dados, setDados] = useState<CalendarioResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Evento | null>(null);
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>({});

  const fim = useMemo(() => addDays(inicio, DIAS_VISIVEIS), [inicio]);

  useEffect(() => {
    setDados(null);
    setErro(null);
    apiFetch(`/api/calendario?inicio=${inicio}&fim=${fim}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Falha ao carregar calendário");
        return res.json();
      })
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar calendário"));
  }, [inicio, fim]);

  const dias = useMemo(() => Array.from({ length: DIAS_VISIVEIS }, (_, i) => addDays(inicio, i)), [inicio]);

  const meses = useMemo(() => {
    const grupos: { label: string; count: number }[] = [];
    for (const d of dias) {
      const bruto = format(parseISO(d), "MMMM 'de' yyyy", { locale: ptBR });
      const label = bruto.charAt(0).toUpperCase() + bruto.slice(1);
      if (grupos.length && grupos[grupos.length - 1].label === label) grupos[grupos.length - 1].count++;
      else grupos.push({ label, count: 1 });
    }
    return grupos;
  }, [dias]);

  function toggleProperty(id: string) {
    setColapsadas((c) => ({ ...c, [id]: !c[id] }));
  }

  const linhas: Array<{ tipo: "property"; property: PropertyGroup } | { tipo: "uh"; uh: UhResumo }> = [];
  const uhRowMap: Record<string, number> = {};
  if (dados) {
    let row = 3;
    for (const p of dados.properties) {
      linhas.push({ tipo: "property", property: p });
      row++;
      if (colapsadas[p.id]) continue;
      for (const uh of p.uhs) {
        linhas.push({ tipo: "uh", uh });
        uhRowMap[uh.id] = row;
        row++;
      }
    }
  }

  const gridTemplateColumns = `${LABEL_COL_PX}px repeat(${DIAS_VISIVEIS}, ${DAY_COL_PX}px)`;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Calendário</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Estadias e bloqueios por UH — inclui as importadas automaticamente via Channex.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInicio((i) => addDays(i, -7))} className="btn-secondary px-2.5 py-1.5" title="7 dias antes">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setInicio(addDays(hoje, -1))} className="btn-secondary px-3 py-1.5 text-sm">
            Hoje
          </button>
          <button onClick={() => setInicio((i) => addDays(i, 7))} className="btn-secondary px-2.5 py-1.5" title="7 dias depois">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {erro && <div className="card border-red-200 bg-red-50 text-red-700 text-sm mb-4">{erro}</div>}

      {!erro && !dados && <div className="card text-sm text-gray-500">Carregando...</div>}

      {dados && (
        <>
          <div className="card p-0 overflow-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
            <div style={{ display: "grid", gridTemplateColumns, gridAutoRows: "min-content" }}>
              {/* Canto superior esquerdo — cobre as duas linhas de cabeçalho */}
              <div
                className="bg-white border-b border-r border-gray-200"
                style={{ gridColumn: 1, gridRow: "1 / 3", position: "sticky", top: 0, left: 0, zIndex: 30 }}
              />

              {/* Linha 1 — mês */}
              {(() => {
                let col = 2;
                return meses.map((m, i) => {
                  const start = col;
                  col += m.count;
                  return (
                    <div
                      key={i}
                      className="bg-white border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center justify-center px-2"
                      style={{
                        gridColumn: `${start} / ${start + m.count}`,
                        gridRow: 1,
                        position: "sticky",
                        top: 0,
                        zIndex: 20,
                        height: ROW1_H,
                      }}
                    >
                      {m.label}
                    </div>
                  );
                });
              })()}

              {/* Linha 2 — dia da semana + número */}
              {dias.map((d, i) => {
                const dt = parseISO(d);
                const fimDeSemana = [0, 6].includes(dt.getDay());
                const ehHoje = d === hoje;
                return (
                  <div
                    key={d}
                    className={`border-b border-r border-gray-100 flex flex-col items-center justify-center text-[11px] ${
                      ehHoje ? "bg-red-50 text-red-700 font-semibold" : fimDeSemana ? "bg-gray-50 text-gray-500" : "bg-white text-gray-500"
                    }`}
                    style={{ gridColumn: i + 2, gridRow: 2, position: "sticky", top: ROW1_H, zIndex: 20, height: ROW2_H }}
                  >
                    <span className="uppercase">{format(dt, "EEE", { locale: ptBR })}</span>
                    <span className="text-sm">{format(dt, "dd")}</span>
                  </div>
                );
              })}

              {/* Linhas de fundo — property (rótulo + faixa cinza) e UH (rótulo + células por dia) */}
              {linhas.map((linha, i) => {
                const row = 3 + i;

                if (linha.tipo === "property") {
                  return (
                    <Fragment key={`p-${linha.property.id}`}>
                      <div
                        className="bg-gray-100 border-b border-gray-200 flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-gray-700"
                        style={{ gridColumn: 1, gridRow: row, position: "sticky", left: 0, zIndex: 15 }}
                      >
                        <button onClick={() => toggleProperty(linha.property.id)} className="text-gray-400 hover:text-gray-700 w-4 text-center">
                          {colapsadas[linha.property.id] ? "+" : "−"}
                        </button>
                        {linha.property.nome}
                      </div>
                      <div className="bg-gray-100 border-b border-gray-200" style={{ gridColumn: "2 / -1", gridRow: row }} />
                    </Fragment>
                  );
                }

                return (
                  <Fragment key={`uh-${linha.uh.id}`}>
                    <div
                      className="bg-white border-b border-r border-gray-100 flex items-center px-3 text-sm"
                      style={{ gridColumn: 1, gridRow: row, position: "sticky", left: 0, zIndex: 10, height: UH_ROW_H }}
                    >
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{linha.uh.numero}</p>
                        <p className="text-xs text-gray-400 leading-tight">{linha.uh.tipo}</p>
                      </div>
                    </div>
                    {dias.map((d, di) => {
                      const dt = parseISO(d);
                      const fimDeSemana = [0, 6].includes(dt.getDay());
                      const ehHoje = d === hoje;
                      return (
                        <div
                          key={`${linha.uh.id}-${d}`}
                          className={`border-b border-r border-gray-100 ${ehHoje ? "bg-red-50/40" : fimDeSemana ? "bg-gray-50" : ""}`}
                          style={{ gridColumn: di + 2, gridRow: row, height: UH_ROW_H }}
                        />
                      );
                    })}
                  </Fragment>
                );
              })}

              {/* Eventos — reservas e bloqueios, posicionados por cima do fundo */}
              {dados.eventos.map((ev) => {
                const row = uhRowMap[ev.uhId];
                if (!row) return null; // UH não encontrada ou dentro de property colapsada

                const startIdx = Math.max(0, diffDays(inicio, ev.checkIn));
                const endIdx = Math.min(DIAS_VISIVEIS, diffDays(inicio, ev.checkOut));
                if (endIdx <= startIdx) return null;
                const colStart = startIdx + 2;
                const colEnd = endIdx + 2;

                if (ev.tipo === "BLOQUEIO") {
                  return (
                    <button
                      key={`bloqueio-${ev.id}`}
                      onClick={() => setSelecionado(ev)}
                      className="m-1 rounded-lg bg-orange-500 text-white text-xs font-medium flex items-center gap-1 px-2 overflow-hidden hover:brightness-95 transition"
                      style={{
                        gridColumn: `${colStart} / ${colEnd}`,
                        gridRow: row,
                        height: UH_ROW_H - 8,
                        alignSelf: "center",
                        position: "relative",
                        zIndex: 5,
                      }}
                      title={MOTIVO_LABEL[ev.motivo] ?? "Bloqueio"}
                    >
                      <Ban className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Bloqueado</span>
                    </button>
                  );
                }

                const badge = CANAL_BADGE[ev.canal] ?? CANAL_BADGE.OUTRO;
                return (
                  <button
                    key={`reserva-${ev.id}`}
                    onClick={() => setSelecionado(ev)}
                    className={`m-1 rounded-lg ${badge.bg} text-white text-xs font-medium flex items-center gap-1.5 px-2 overflow-hidden hover:brightness-95 transition`}
                    style={{
                      gridColumn: `${colStart} / ${colEnd}`,
                      gridRow: row,
                      height: UH_ROW_H - 8,
                      alignSelf: "center",
                      position: "relative",
                      zIndex: 5,
                    }}
                    title={`${ev.hospedeNome} — ${CANAL_LABEL[ev.canal]}`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {badge.letra}
                    </span>
                    <span className="truncate">{ev.hospedeNome}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
            {Object.entries(CANAL_BADGE).map(([canal, b]) => (
              <span key={canal} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded ${b.bg}`} />
                {CANAL_LABEL[canal]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-500" />
              Bloqueio
            </span>
          </div>
        </>
      )}

      {selecionado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setSelecionado(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">{selecionado.tipo === "RESERVA" ? "Reserva" : "Bloqueio"}</h2>
              <button onClick={() => setSelecionado(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              <Campo label="Check-in" valor={fmt(selecionado.checkIn)} />
              <Campo label="Check-out" valor={fmt(selecionado.checkOut)} />
              {selecionado.tipo === "RESERVA" ? (
                <>
                  <Campo label="Nome" valor={selecionado.hospedeNome} />
                  <Campo label="Telefone" valor={selecionado.hospedeTelefone || "—"} />
                  <Campo label="Tipo" valor={`Reserva — ${CANAL_LABEL[selecionado.canal]}`} />
                </>
              ) : (
                <>
                  <Campo label="Nome" valor="—" />
                  <Campo label="Telefone" valor="—" />
                  <Campo label="Tipo" valor={MOTIVO_LABEL[selecionado.motivo] ?? "Bloqueio"} />
                  {selecionado.descricao && <Campo label="Descrição" valor={selecionado.descricao} />}
                  <Campo label="Registrado por" valor={selecionado.criadoPorNome} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-50 pb-2">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 text-right">{valor}</span>
    </div>
  );
}
