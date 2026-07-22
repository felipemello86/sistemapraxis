"use client";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import type { LogEvento } from "@/app/api/logs/route";

// Portado de apps/housekeeping/src/app/logs/LogView.tsx (v1) 1:1 — única
// diferença é fetch → apiFetch (basePath /governance).

type Camareira = { id: string; nome: string };

const TIPO_META: Record<string, { label: string; cor: string; icon: string }> = {
  ATRIBUICAO_CRIADA: { label: "Atribuição criada",    cor: "bg-gray-100 text-gray-600 border-gray-200",      icon: "📋" },
  UH_LIBERADA:       { label: "UH liberada",           cor: "bg-blue-50 text-blue-700 border-blue-200",        icon: "🔓" },
  LIMPEZA_INICIADA:  { label: "Limpeza iniciada",      cor: "bg-yellow-50 text-yellow-700 border-yellow-200",  icon: "🧹" },
  LIMPEZA_CONCLUIDA: { label: "Limpeza concluída",     cor: "bg-purple-50 text-purple-700 border-purple-200",  icon: "✅" },
  INSPECAO_INICIADA: { label: "Inspeção iniciada",     cor: "bg-orange-50 text-orange-700 border-orange-200",  icon: "🔍" },
  INSPECAO_CONCLUIDA:{ label: "Inspeção concluída",    cor: "bg-green-50 text-green-700 border-green-200",     icon: "🏁" },
  COBERTURA_CRIADA:  { label: "Cobertura registrada",  cor: "bg-indigo-50 text-indigo-700 border-indigo-200",  icon: "🔄" },
  FOTOS_EDITADAS:    { label: "Fotos editadas",        cor: "bg-pink-50 text-pink-700 border-pink-200",        icon: "📷" },
};

const LINHA_COR: Record<string, string> = {
  ATRIBUICAO_CRIADA:  "bg-gray-300",
  UH_LIBERADA:        "bg-blue-400",
  LIMPEZA_INICIADA:   "bg-yellow-400",
  LIMPEZA_CONCLUIDA:  "bg-purple-500",
  INSPECAO_INICIADA:  "bg-orange-400",
  INSPECAO_CONCLUIDA: "bg-green-500",
  COBERTURA_CRIADA:   "bg-indigo-400",
  FOTOS_EDITADAS:     "bg-pink-400",
};

function formatDuracao(seg: number) {
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}min${s > 0 ? ` ${s}s` : ""}`;
}

function Operador({ nome }: { nome?: string | null }) {
  if (!nome) return null;
  return <span className="text-gray-400"> · por <span className="font-medium text-gray-600">{nome}</span></span>;
}

function Descricao({ ev }: { ev: LogEvento }) {
  const extra = ev.extra as any;
  switch (ev.tipo) {
    case "ATRIBUICAO_CRIADA":
      return (
        <span>
          UH <b>{ev.uhNumero}</b> atribuída a <b>{ev.atoreNome}</b>
          {extra?.programa ? ` · ${extra.programa}` : ""}
          <Operador nome={extra?.operador} />
        </span>
      );
    case "UH_LIBERADA":
      return (
        <span>
          UH <b>{ev.uhNumero}</b> liberada para limpeza
          <Operador nome={extra?.operador} />
        </span>
      );
    case "LIMPEZA_INICIADA":
      return <span><b>{ev.atoreNome}</b> iniciou a limpeza da UH <b>{ev.uhNumero}</b></span>;
    case "LIMPEZA_CONCLUIDA":
      return <span><b>{ev.atoreNome}</b> concluiu a limpeza da UH <b>{ev.uhNumero}</b>{extra?.duracaoSegundos ? ` em ${formatDuracao(extra.duracaoSegundos)}` : ""}</span>;
    case "FOTOS_EDITADAS":
      return <span><b>{ev.atoreNome}</b> editou as fotos da UH <b>{ev.uhNumero}</b> (já concluída)</span>;
    case "INSPECAO_INICIADA":
      return <span><b>{ev.atoreNome}</b> iniciou a inspeção da UH <b>{ev.uhNumero}</b></span>;
    case "INSPECAO_CONCLUIDA":
      return (
        <span>
          <b>{ev.atoreNome}</b> liberou UH <b>{ev.uhNumero}</b> para check-in
          {extra?.totalFalhas !== undefined && (
            <> · <span className={extra.totalFalhas > 0 ? "text-red-500" : "text-green-600"}>
              {extra.totalFalhas === 0 ? "sem falhas" : `${extra.totalFalhas} falha(s)`}
            </span></>
          )}
          {extra?.score !== undefined && (
            <> · <span className="font-bold text-gray-800">{extra.score} pts</span></>
          )}
        </span>
      );
    default:
      return <span>{ev.atoreNome} · UH {ev.uhNumero}</span>;
  }
}

export default function LogView({ camareiras }: { camareiras: Camareira[] }) {
  const [data, setData] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [tipo, setTipo] = useState("");
  const [ator, setAtor] = useState("");
  const [eventos, setEventos] = useState<LogEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ data });
    if (tipo) params.set("tipo", tipo);
    if (ator) params.set("ator", ator);
    apiFetch(`/api/logs?${params}`)
      .then((r) => r.json())
      .then((d) => { setEventos(d); setLoading(false); setAtualizadoEm(new Date()); });
  }, [data, tipo, ator]);

  useEffect(() => { carregar(); }, [carregar]);

  const navegarData = (delta: number) => {
    const d = new Date(data + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setData(d.toLocaleDateString("en-CA"));
  };

  // Agrupa eventos por hora
  const agrupados: Record<string, LogEvento[]> = {};
  for (const ev of eventos) {
    const chave = format(new Date(ev.timestamp), "HH");
    if (!agrupados[chave]) agrupados[chave] = [];
    agrupados[chave].push(ev);
  }
  const horas = Object.keys(agrupados).sort((a, b) => b.localeCompare(a));

  const dataFmt = format(new Date(data + "T12:00:00"), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const isHoje = data === new Date().toLocaleDateString("en-CA");

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Log do Sistema</h1>
          <p className="text-sm text-gray-500 capitalize">{dataFmt}</p>
        </div>
        <div className="flex items-center gap-2">
          {atualizadoEm && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Atualizado {format(atualizadoEm, "HH:mm:ss")}
            </span>
          )}
          <button onClick={carregar} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-40 transition-colors" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap gap-3">
        {/* Navegação de data */}
        <div className="flex items-center gap-1">
          <button onClick={() => navegarData(-1)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="input w-auto text-base py-1.5" />
          <button onClick={() => navegarData(1)} disabled={isHoje}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Tipo de evento */}
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="input text-base py-1.5 flex-1 min-w-[180px]">
          <option value="">Todos os eventos</option>
          {Object.entries(TIPO_META).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>

        {/* Filtro por camareira */}
        <select value={ator} onChange={(e) => setAtor(e.target.value)}
          className="input text-base py-1.5 flex-1 min-w-[150px]">
          <option value="">Todos os atores</option>
          {camareiras.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        {(tipo || ator) && (
          <button onClick={() => { setTipo(""); setAtor(""); }}
            className="text-xs text-blue-600 hover:underline px-2">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Contador */}
      {!loading && (
        <p className="text-sm text-gray-500 px-1">
          {eventos.length === 0 ? "Nenhum evento encontrado" : `${eventos.length} evento${eventos.length !== 1 ? "s" : ""}`}
        </p>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : eventos.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">Nenhum evento para este período</p>
          <p className="text-sm mt-1">Tente ajustar os filtros ou escolher outra data.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {horas.map((hora) => (
            <div key={hora}>
              {/* Header da hora */}
              <div className="flex items-center gap-3 mb-3">
                <div className="text-xs font-bold text-gray-400 w-12 text-right">{hora}h</div>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Eventos da hora */}
              <div className="space-y-2 pl-16">
                {agrupados[hora].map((ev) => {
                  const meta = TIPO_META[ev.tipo] || { label: ev.tipo, cor: "bg-gray-100 text-gray-600 border-gray-200", icon: "•" };
                  const linhaCor = LINHA_COR[ev.tipo] || "bg-gray-300";
                  return (
                    <div key={ev.id} className="flex gap-3 items-start">
                      {/* Bolinha + linha vertical */}
                      <div className="flex flex-col items-center flex-shrink-0 mt-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${linhaCor} flex-shrink-0`} />
                      </div>

                      {/* Card do evento */}
                      <div className={`flex-1 rounded-lg border px-3 py-2 text-sm ${meta.cor}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="text-base leading-none mt-0.5 flex-shrink-0">{meta.icon}</span>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold opacity-70 uppercase tracking-wide block mb-0.5">
                                {meta.label}
                              </span>
                              <p className="leading-snug"><Descricao ev={ev} /></p>
                            </div>
                          </div>
                          <span className="text-xs opacity-60 flex-shrink-0 mt-0.5 tabular-nums">
                            {format(new Date(ev.timestamp), "HH:mm:ss")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
