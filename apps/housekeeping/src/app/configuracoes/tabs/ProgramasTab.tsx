"use client";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Pencil, Check, X, Plus } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/configuracoes/tabs/ProgramasTab.tsx (v1).
// fetch(...) → apiFetch(...); resto idêntico. API /api/programas já existia
// portada em v2 com o mesmo contrato.

type Step = { id?: string; titulo: string; descricao: string; ordem: number };
type Program = { id: string; nome: string; tipo: string; steps: Step[] };

function DescricaoStep({ texto }: { texto: string }) {
  const linhas = texto.split("\n").filter(Boolean);
  if (linhas.length === 1) return <p className="text-xs text-gray-500 mt-0.5">{texto}</p>;
  return (
    <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
      {linhas.map((linha, i) => (
        <p key={i}><span className="font-medium">{i + 1}.</span> {linha}</p>
      ))}
    </div>
  );
}

export default function ProgramasTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [editSteps, setEditSteps] = useState<Step[]>([]);
  const [editNome, setEditNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const data = await apiFetch("/api/programas").then((r) => r.json());
    setPrograms(data);
    setLoading(false);
  }

  function startEdit(p: Program) {
    setEditingProgram(p.id);
    setEditNome(p.nome);
    setEditSteps(p.steps.map((s) => ({ ...s })));
    setExpanded(p.id);
  }

  async function salvar(id: string) {
    setSalvando(true);
    await apiFetch("/api/programas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, nome: editNome, steps: editSteps }),
    });
    setEditingProgram(null);
    setSalvando(false);
    carregar();
  }

  function addStep() {
    setEditSteps((prev) => [
      ...prev,
      { titulo: "", descricao: "", ordem: prev.length + 1 },
    ]);
  }

  function removeStep(idx: number) {
    setEditSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, ordem: i + 1 })));
  }

  if (loading) return <div className="text-gray-400">Carregando...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-gray-500">
        Edite os passos de cada programa de limpeza. O programa <strong>Limpeza Específica</strong> não tem detalhamento de passos.
      </p>

      {programs.map((p) => (
        <div key={p.id} className="card">
          {/* Header do programa */}
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-2 flex-1 text-left"
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              {expanded === p.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span className="font-semibold">{p.nome}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{p.tipo}</span>
            </button>
            {!somenteLeitura && editingProgram !== p.id && (
              <button onClick={() => startEdit(p)} className="text-gray-400 hover:text-blue-600 ml-2">
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Conteúdo expandido */}
          {expanded === p.id && (
            <div className="mt-4 border-t pt-4">
              {editingProgram === p.id ? (
                <div className="space-y-4">
                  <div>
                    <label className="label">Nome do programa</label>
                    <input className="input" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Etapas</label>
                      {p.tipo !== "LIMPEZA_COMPLETA" && (
                        <button onClick={addStep} className="text-sm text-blue-600 flex items-center gap-1 hover:text-blue-700">
                          <Plus className="w-3 h-3" /> Adicionar etapa
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {editSteps.map((s, i) => (
                        <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 w-5">{i + 1}.</span>
                            <input
                              className="input flex-1"
                              placeholder="Título da etapa"
                              value={s.titulo}
                              onChange={(e) => setEditSteps((prev) => prev.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x))}
                            />
                            {p.tipo !== "LIMPEZA_COMPLETA" && (
                              <button onClick={() => removeStep(i)} className="text-gray-400 hover:text-red-500">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <textarea
                            className="input text-base"
                            placeholder="Descrição / instruções detalhadas"
                            rows={2}
                            value={s.descricao}
                            onChange={(e) => setEditSteps((prev) => prev.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => salvar(p.id)} disabled={salvando} className="btn-primary">
                      {salvando ? "Salvando..." : "Salvar"}
                    </button>
                    <button onClick={() => setEditingProgram(null)} className="btn-secondary">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {p.steps.map((s) => (
                    <div key={s.ordem} className="flex gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5 mt-0.5">{s.ordem}.</span>
                      <div>
                        <p className="text-sm font-medium">{s.titulo}</p>
                        {s.descricao && <DescricaoStep texto={s.descricao} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
