"use client";
import { useState } from "react";
import { LayoutGrid, LineChart as LineChartIcon } from "lucide-react";
import KanbanTempoReal from "./KanbanTempoReal";
import BurndownChart from "./BurndownChart";

// Tela "Tempo Real" ganhou duas subtelas (pedido do Felipe, 05/08/2026): o
// Quadro (Kanban por UH) virou a subtela padrão, e o Burndown original (que
// já era "a tela mais valiosa do módulo segundo o Felipe" — ver comentário
// em api/burndown/route.ts) passa a ser a segunda aba, sem perder nada do
// que já existia.
export default function TempoRealTabs({ role, podeOperar }: { role: string; podeOperar: boolean }) {
  const [tab, setTab] = useState<"kanban" | "burndown">("kanban");

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setTab("kanban")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
            tab === "kanban" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" /> Quadro
        </button>
        <button
          onClick={() => setTab("burndown")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
            tab === "burndown" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          <LineChartIcon className="w-3.5 h-3.5" /> Burndown
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "kanban" ? (
          <KanbanTempoReal role={role} podeOperar={podeOperar} />
        ) : (
          <BurndownChart role={role} podeOperar={podeOperar} />
        )}
      </div>
    </div>
  );
}
