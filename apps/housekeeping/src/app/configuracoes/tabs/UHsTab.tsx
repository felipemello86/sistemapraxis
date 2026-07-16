"use client";
import { useState, useEffect } from "react";
import { Plus, Pencil, Check, X, Trash2, ArrowUpDown } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/configuracoes/tabs/UHsTab.tsx (v1).
// fetch(...) → apiFetch(...); resto idêntico. API /api/uhs já existia
// portada em v2 com o mesmo contrato.

type UH = { id: string; numero: string; tipo: string; status: string; ordem: number; ativo: boolean };

export default function UHsTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [uhs, setUHs] = useState<UH[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNumero, setEditNumero] = useState("");
  const [newNumero, setNewNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ascending, setAscending] = useState(true);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      const r = await apiFetch("/api/uhs");
      const data = await r.json();
      setUHs(Array.isArray(data) ? data : []);
    } catch {
      setErro("Erro ao carregar UHs");
    }
    setLoading(false);
  }

  async function adicionar() {
    if (!newNumero) return;
    setErro(null);
    setSalvando(true);
    try {
      const r = await apiFetch("/api/uhs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: newNumero, tipo: "Standard", ordem: 0 }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErro(data.error || `Erro ${r.status}`);
      } else {
        setNewNumero("");
        carregar();
      }
    } catch (e: any) {
      setErro(e.message || "Erro ao adicionar");
    }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editId) return;
    setSalvando(true);
    await apiFetch("/api/uhs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, numero: editNumero, tipo: "Standard", ordem: 0 }),
    });
    setEditId(null);
    setSalvando(false);
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta UH?")) return;
    await apiFetch(`/api/uhs?id=${id}`, { method: "DELETE" });
    carregar();
  }

  const sorted = [...uhs].sort((a, b) =>
    ascending
      ? a.numero.localeCompare(b.numero, undefined, { numeric: true })
      : b.numero.localeCompare(a.numero, undefined, { numeric: true })
  );

  if (loading) return <div className="text-gray-400">Carregando...</div>;

  return (
    <div className="max-w-2xl">
      {somenteLeitura && (
        <div className="mb-4 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          👁 Modo somente leitura — alterações não são permitidas.
        </div>
      )}
      {/* Adicionar nova */}
      {!somenteLeitura && <div className="card mb-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Nova UH</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">Número/Nome</label>
            <input
              className="input"
              placeholder="ex: 101, CHALÉ A"
              value={newNumero}
              onChange={(e) => setNewNumero(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
            />
          </div>
          <div className="flex items-end">
            <button onClick={adicionar} disabled={salvando || !newNumero} className="btn-primary">Adicionar</button>
          </div>
        </div>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </div>}

      {/* Cabeçalho da lista */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm text-gray-500">{uhs.length} UH(s)</span>
        <button
          onClick={() => setAscending(!ascending)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"
        >
          <ArrowUpDown className="w-4 h-4" />
          {ascending ? "A → Z" : "Z → A"}
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {sorted.map((uh) => (
          <div key={uh.id} className="card">
            {!somenteLeitura && editId === uh.id ? (
              <div className="flex gap-3 items-center">
                <input className="input flex-1" value={editNumero} onChange={(e) => setEditNumero(e.target.value)} />
                <button onClick={salvarEdicao} className="text-green-600 hover:text-green-700"><Check className="w-5 h-5" /></button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="font-bold">{uh.numero}</span>
                {!somenteLeitura && (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditId(uh.id); setEditNumero(uh.numero); }} className="text-gray-400 hover:text-blue-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => excluir(uh.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
