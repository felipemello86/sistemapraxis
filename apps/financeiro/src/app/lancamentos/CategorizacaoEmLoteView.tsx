"use client";
import { useEffect, useState } from "react";
import { Check, ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Categorização em lote — pedido do Felipe, 05/08/2026, depois que a
// primeira sincronização real da Unicred trouxe 5194 lançamentos pendentes
// de uma vez (histórico de ~12 meses). Categorizar um por um não é viável
// nesse volume; aqui agrupamos por fornecedor (ou descrição, quando não há
// fornecedor) e aplicamos a categoria pro grupo inteiro com um clique —
// "NETFLIX.COM" vira 1 linha com N lançamentos, não N linhas.

type Categoria = { id: string; nome: string; tipo: string; bloco: string };
type Grupo = { tipo: "fornecedor" | "descricao"; chave: string; quantidade: number; total: number; exemploDescricao: string };

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CategorizacaoEmLoteView({ onVoltar }: { onVoltar: () => void }) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [totalPendentes, setTotalPendentes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const [resG, resC] = await Promise.all([apiFetch("/api/lancamentos/pendentes-agrupados"), apiFetch("/api/categorias")]);
    if (resG.ok) {
      const data = await resG.json();
      setGrupos(data.grupos);
      setTotalPendentes(data.totalPendentes);
    }
    if (resC.ok) setCategorias(await resC.json());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function aplicarCategoria(grupo: Grupo, categoriaId: string) {
    const id = `${grupo.tipo}:${grupo.chave}`;
    setAplicando(id);
    try {
      const res = await apiFetch("/api/lancamentos/categorizar-lote", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: grupo.tipo, chave: grupo.chave, categoriaId }),
      });
      if (res.ok) {
        setTotalPendentes((n) => n - grupo.quantidade);
        setGrupos((prev) => prev.filter((g) => `${g.tipo}:${g.chave}` !== id));
      }
    } finally {
      setAplicando(null);
    }
  }

  const categoriasReceita = categorias.filter((c) => c.tipo === "RECEITA");
  const categoriasDespesa = categorias.filter((c) => c.tipo === "DESPESA");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onVoltar} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Voltar pra lista
        </button>
        <p className="text-sm text-gray-500">{totalPendentes} lançamento{totalPendentes !== 1 ? "s" : ""} pendente{totalPendentes !== 1 ? "s" : ""}</p>
      </div>

      <p className="text-sm text-gray-500">
        Agrupado por fornecedor — categoriza todos os lançamentos do grupo de uma vez. Só mexe em quem ainda está sem categoria.
      </p>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : grupos.length === 0 ? (
        <div className="card flex items-center gap-2 text-green-700">
          <Check className="w-5 h-5" /> Nenhum lançamento pendente — tudo categorizado.
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => {
            const id = `${g.tipo}:${g.chave}`;
            const categoriasDoTipo = g.total >= 0 ? categoriasReceita : categoriasDespesa;
            return (
              <div key={id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-gray-900 truncate">{g.chave}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {g.quantidade} lançamento{g.quantidade !== 1 ? "s" : ""} · total{" "}
                    <span className={g.total >= 0 ? "text-green-700" : "text-red-600"}>{formatBRL(g.total)}</span>
                  </p>
                </div>
                <select
                  disabled={aplicando === id}
                  onChange={(e) => e.target.value && aplicarCategoria(g, e.target.value)}
                  defaultValue=""
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 flex-shrink-0"
                >
                  <option value="" disabled>
                    {aplicando === id ? "Aplicando..." : "Categorizar todos..."}
                  </option>
                  {categoriasDoTipo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
