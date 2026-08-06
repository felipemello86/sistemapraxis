"use client";
import { X } from "lucide-react";
import { SeletorCentroCusto, type Empreendimento, type Unidade } from "./SeletorCentroCusto";

// Versão em popup do SeletorCentroCusto (mesmo motivo do
// SeletorCategoriaPopup, pedido do Felipe, 06/08/2026: card compacto da
// tela de Conciliações em lote não tem altura sobrando pros 3
// botões+selects do seletor completo). Diferente do de Categoria, não
// fecha sozinho ao clicar (Empreendimento/Unidade exigem escolher a
// sub-opção depois) — fecha só no botão "Concluído" ou no X/fundo.

export function SeletorCentroCustoPopup({
  open,
  onClose,
  tipo,
  empreendimentoId,
  unidadeId,
  empreendimentos,
  unidades,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  tipo: string;
  empreendimentoId: string | null;
  unidadeId: string | null;
  empreendimentos: Empreendimento[];
  unidades: Unidade[];
  onChange: (v: { centroCustoTipo: "ADMINISTRACAO" | "EMPREENDIMENTO" | "UNIDADE"; empreendimentoId: string | null; unidadeId: string | null }) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Centro de custo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <SeletorCentroCusto
          tipo={tipo}
          empreendimentoId={empreendimentoId}
          unidadeId={unidadeId}
          empreendimentos={empreendimentos}
          unidades={unidades}
          onChange={onChange}
        />
        <button onClick={onClose} className="btn-primary w-full">
          Concluído
        </button>
      </div>
    </div>
  );
}
