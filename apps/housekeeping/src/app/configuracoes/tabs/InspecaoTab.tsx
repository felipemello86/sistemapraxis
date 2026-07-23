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

type Item = { id?: string; categoria: string; item: string; ordem: number; tipoFalha?: string };

export default function InspecaoTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novoItem, setNovoItem] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("CAMA");
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setErro(null);
    try {
      const res = await apiFetch("/api/inspecao-template");
      if (!res.ok) throw new Error(`Falha ao carregar checklist (${res.status})`);
      const data = await res.json();
      setItens(Array.isArray(data) ? data : []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar checklist");
    } finally {
      setLoading(false);
    }
  }

  function addItem() {
    if (!novoItem.trim()) return;
    setItens((prev) => [...prev, { categoria: novaCategoria, item: novoItem.trim(), ordem: prev.length + 1, tipoFalha: "CAMAREIRA" }]);
    setNovoItem("");
  }

  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, ordem: i + 1 })));
  }

  function editarTexto(idx: number, texto: string) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, item: texto } : it)));
  }

  function editarTipoFalha(idx: number, tipoFalha: "CAMAREIRA" | "GERENCIAL") {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, tipoFalha } : it)));
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
  if (erro) {
    return (
      <div className="max-w-2xl">
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center justify-between gap-3">
          <span>Não foi possível carregar o checklist: {erro}</span>
          <button onClick={carregar} className="btn-secondary text-xs flex-shrink-0">Tentar de novo</button>
        </div>
      </div>
    );
  }

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
          // Modo edição: texto editável inline + natureza (Camareira/Gerencial) + remover
          CATEGORIAS.map((cat) => {
            const catItens = itens.filter((it) => it.categoria === cat);
            if (catItens.length === 0) return null;
            return (
              <div key={cat} className="card">
                <p className="text-sm font-bold text-gray-700 mb-2">{CAT_LABELS[cat]}</p>
                <div className="space-y-2">
                  {catItens.map((it) => {
                    const globalIdx = itens.indexOf(it);
                    const gerencial = it.tipoFalha === "GERENCIAL";
                    return (
                      <div key={globalIdx} className="flex items-center gap-2 py-1">
                        <span className="text-xs text-gray-400 w-5 flex-shrink-0">{it.ordem}.</span>
                        <input
                          className="input flex-1 text-sm py-1.5"
                          value={it.item}
                          onChange={(e) => editarTexto(globalIdx, e.target.value)}
                        />
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => editarTipoFalha(globalIdx, "CAMAREIRA")}
                            className={`px-2 py-1.5 text-xs font-medium transition-colors ${!gerencial ? "bg-red-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                          >
                            Camareira
                          </button>
                          <button
                            type="button"
                            onClick={() => editarTipoFalha(globalIdx, "GERENCIAL")}
                            className={`px-2 py-1.5 text-xs font-medium transition-colors ${gerencial ? "bg-orange-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                          >
                            Gerencial
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(globalIdx)}
                          className="text-red-400 hover:text-red-600 p-1 flex-shrink-0"
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
                    <span className="flex-1">{it.item}</span>
                    {it.tipoFalha === "GERENCIAL" && (
                      <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-1.5 py-0.5">
                        Gerencial
                      </span>
                    )}
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
