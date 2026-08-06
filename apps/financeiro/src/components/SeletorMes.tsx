"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Seletor de mês compartilhado (pedido do Felipe, 06/08/2026): mesmo
// visual/comportamento nas 3 telas que navegam por mês — Lançamentos (onde
// nasceu), DRE e Orçamento. Setas prev/next + botão central que abre um
// popover com navegação de ano e grade de 12 meses.

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesAdjacente(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]}/${String(ano).slice(2)}`;
}

export function SeletorMes({ mes, onChange, className }: { mes: string; onChange: (mes: string) => void; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const [anoNav, setAnoNav] = useState(Number(mes.slice(0, 4)));

  return (
    <div className={`relative flex items-center gap-0.5 border border-gray-300 rounded-lg px-1 py-1 ${className ?? ""}`}>
      <button onClick={() => onChange(mesAdjacente(mes, -1))} className="text-gray-400 hover:text-gray-900 p-1" aria-label="Mês anterior">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => {
          setAnoNav(Number(mes.slice(0, 4)));
          setAberto((v) => !v);
        }}
        className="text-sm font-medium text-gray-700 px-1 min-w-[84px] text-center"
      >
        {mesLabel(mes)}
      </button>
      <button onClick={() => onChange(mesAdjacente(mes, 1))} className="text-gray-400 hover:text-gray-900 p-1" aria-label="Próximo mês">
        <ChevronRight className="w-4 h-4" />
      </button>

      {aberto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setAberto(false);
            }}
          />
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setAnoNav((a) => a - 1)} className="text-gray-400 hover:text-gray-900">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900">{anoNav}</span>
              <button onClick={() => setAnoNav((a) => a + 1)} className="text-gray-400 hover:text-gray-900">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {NOMES_MES.map((nome, i) => {
                const valor = `${anoNav}-${String(i + 1).padStart(2, "0")}`;
                const ativo = valor === mes;
                return (
                  <button
                    key={nome}
                    onClick={() => {
                      onChange(valor);
                      setAberto(false);
                    }}
                    className={`text-xs py-1.5 rounded ${ativo ? "bg-gray-900 text-white" : "hover:bg-gray-100 text-gray-600"}`}
                  >
                    {nome.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
