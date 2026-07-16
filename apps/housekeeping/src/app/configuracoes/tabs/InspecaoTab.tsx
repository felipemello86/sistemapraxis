"use client";
import { useState, useEffect } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/configuracoes/tabs/InspecaoTab.tsx (v1).
// fetch(...) → apiFetch(...); resto idêntico.

const CATEGORIAS = ["CAMA", "BANHEIRO", "QUARTO", "COZINHA", "GERAL"];
const CAT_LABELS: Record<string, string> = {
  CAMA: "🛏️ Cama",
  BANHEIRO: "🚿 Banheiro",
  QUARTO: "🏠 Quarto",
  COZINHA: "🍳 Cozinha",
  GERAL: "✅ Geral",
};

type Item = { id?: string; categoria: string; item: string; ordem: number };

export default function InspecaoTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novoItem, setNovoItem] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("CAMA");
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const data = await apiFetch("/api/inspecao-template").then((r) => r.json());
    setItens(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  function addItem() {
    if (!novoItem.trim()) return;
    setItens((prev) => [...prev, { categoria: novaCategoria, item: novoItem.trim(), ordem: prev.length + 1 }]);
    setNovoItem("");
  }

  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, ordem: i + 1 })));
  }

  async function salvar() {
    setSalvando(true);
    await apiFetch("/api/inspecao-template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens }),
    });
    setSalvando(false);
    setEditando(false);
    setSucesso(true);
    setTimeout(() => setSucesso(false), 2000);
    carregar();
  }

  function cancelar() {
    setEditando(false);
    carregar();
  }

  if (loading) return <div className="text-gray-400">Carregando...</div>;

  const porCategoria = CATEGORIAS.map((cat) => ({
    cat,
    items: itens.filter((it) => it.categoria === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Estes itens são usados em todas as inspeções. Alterações valem para novas inspeções.
        </p>
        {!somenteLeitura && (!editando ? (
          <button onClick={() => setEditando(true)} className="btn-secondary text-sm">
            Editar checklist
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={cancelar} className="btn-secondary text-sm flex items-center gap-1">
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button onClick={salvar} disabled={salvando} className="btn-primary text-sm flex items-center gap-1">
              <Check className="w-4 h-4" /> {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        ))}
      </div>

      {sucesso && (
        <div className="bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg mb-4">
          ✓ Checklist salvo com sucesso!
        </div>
      )}

      {editando && (
        <div className="card mb-4 bg-blue-50 border-blue-200">
          <p className="text-sm font-medium text-blue-800 mb-2">Adicionar item</p>
          <div className="flex gap-2">
            <select
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              className="input w-40 flex-shrink-0"
            >
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <input
              className="input flex-1"
              placeholder="Descrição do item..."
              value={novoItem}
              onChange={(e) => setNovoItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <button onClick={addItem} className="btn-primary flex-shrink-0">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {editando ? (
          // Modo edição: lista plana com botão de remover
          CATEGORIAS.map((cat) => {
            const catItens = itens.filter((it) => it.categoria === cat);
            if (catItens.length === 0) return null;
            return (
              <div key={cat} className="card">
                <p className="text-sm font-bold text-gray-700 mb-2">{CAT_LABELS[cat]}</p>
                <div className="space-y-1">
                  {catItens.map((it) => {
                    const globalIdx = itens.indexOf(it);
                    return (
                      <div key={globalIdx} className="flex items-center gap-2 py-1">
                        <span className="text-xs text-gray-400 w-5">{it.ordem}.</span>
                        <span className="text-sm flex-1">{it.item}</span>
                        <button
                          onClick={() => removeItem(globalIdx)}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          // Modo visualização
          porCategoria.map(({ cat, items }) => (
            <div key={cat} className="card">
              <p className="text-sm font-bold text-gray-700 mb-2">{CAT_LABELS[cat]}</p>
              <div className="space-y-1">
                {items.map((it) => (
                  <div key={it.ordem} className="flex items-center gap-2 text-sm text-gray-600 py-0.5">
                    <span className="text-gray-400 w-5 text-xs">{it.ordem}.</span>
                    {it.item}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
