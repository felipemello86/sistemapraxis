"use client";
import { useState } from "react";

// Portado sem alterações de apps/housekeeping/src/app/movimentos/PeriodoPicker.tsx (v1)
// — não faz nenhuma chamada de API, só monta o filtro consumido pelas views.

export type Periodo = {
  tipo: "hoje" | "mes" | "alltime" | "custom";
  data: string;       // data do cliente (yyyy-MM-dd) — sempre presente
  dataIni?: string;
  dataFim?: string;
};

export function buildQuery(periodo: Periodo): string {
  const p = new URLSearchParams({ periodo: periodo.tipo, data: periodo.data });
  if (periodo.tipo === "custom" && periodo.dataIni && periodo.dataFim) {
    p.set("dataIni", periodo.dataIni);
    p.set("dataFim", periodo.dataFim);
  }
  return p.toString();
}

const LABELS: Record<string, string> = {
  hoje: "Hoje",
  mes: "Este mês",
  alltime: "All time",
  custom: "Período",
};

export default function PeriodoPicker({
  value,
  onChange,
}: {
  value: Periodo;
  onChange: (p: Periodo) => void;
}) {
  const hoje = new Date().toLocaleDateString("en-CA");
  const [customIni, setCustomIni] = useState(value.dataIni || hoje);
  const [customFim, setCustomFim] = useState(value.dataFim || hoje);

  function set(tipo: Periodo["tipo"]) {
    if (tipo === "custom") {
      onChange({ tipo: "custom", data: hoje, dataIni: customIni, dataFim: customFim });
    } else {
      onChange({ tipo, data: hoje });
    }
  }

  function applyCustom() {
    onChange({ tipo: "custom", data: hoje, dataIni: customIni, dataFim: customFim });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(["hoje", "mes", "alltime", "custom"] as const).map((t) => (
          <button
            key={t}
            onClick={() => set(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              value.tipo === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>

      {value.tipo === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customIni}
            max={customFim}
            onChange={(e) => setCustomIni(e.target.value)}
            className="input text-base py-1.5 w-auto"
          />
          <span className="text-gray-400 text-sm">até</span>
          <input
            type="date"
            value={customFim}
            min={customIni}
            onChange={(e) => setCustomFim(e.target.value)}
            className="input text-base py-1.5 w-auto"
          />
          <button
            onClick={applyCustom}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
