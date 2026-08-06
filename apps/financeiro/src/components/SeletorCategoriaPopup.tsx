"use client";
import { X } from "lucide-react";
import { SeletorCategoria, type CategoriaSelecionavel } from "./SeletorCategoria";

// Versão em popup do SeletorCategoria (pedido do Felipe, 06/08/2026, tela
// de Conciliações em lote: "para facilitar, esse tabelão deveria ser
// composto por cards compactos (...) também ajudaria o processo de seleção
// de categorias ser em popup") — o card compacto não tem altura sobrando
// pra lista expansível de blocos/categorias ficar sempre visível sem
// derrubar o layout de grade; em popup ela pode ocupar a tela inteira sem
// afetar o card por trás. Fecha sozinho ao escolher uma categoria.

export function SeletorCategoriaPopup({
  open,
  onClose,
  categoriaId,
  categorias,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  categoriaId: string;
  categorias: CategoriaSelecionavel[];
  onChange: (id: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Categoria</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <SeletorCategoria
          categoriaId={categoriaId}
          categorias={categorias}
          onChange={(id) => {
            onChange(id);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
