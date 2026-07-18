"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type Movimento = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  quantidade: number;
  usuarioNome: string;
  observacao: string | null;
  createdAt: string;
  product: { id: string; nome: string; unidade: string };
};

type Produto = { id: string; nome: string };

export function MovimentosView() {
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  async function carregar() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroProduto) params.set("productId", filtroProduto);
    if (filtroTipo) params.set("tipo", filtroTipo);
    const [resMov, resProd] = await Promise.all([
      apiFetch(`/api/movimentos?${params.toString()}`),
      apiFetch("/api/produtos?incluirInativos=1"),
    ]);
    if (resMov.ok) setMovimentos(await resMov.json());
    if (resProd.ok) setProdutos(await resProd.json());
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [filtroProduto, filtroTipo]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Movimentações</h1>
        <p className="text-sm text-gray-500">Histórico de entradas e saídas de estoque</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select className="input sm:max-w-xs" value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)}>
          <option value="">Todos os produtos</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select className="input sm:max-w-[160px]" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Entrada e saída</option>
          <option value="ENTRADA">Só entradas</option>
          <option value="SAIDA">Só saídas</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : movimentos.length === 0 ? (
        <div className="card text-center text-gray-500 text-sm py-8">Nenhuma movimentação encontrada.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-right px-4 py-3">Quantidade</th>
                <th className="text-left px-4 py-3">Usuário</th>
                <th className="text-left px-4 py-3">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movimentos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(new Date(m.createdAt), "dd/MM/yyyy HH:mm")}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.product.nome}</td>
                  <td className="px-4 py-3">
                    {m.tipo === "ENTRADA" ? (
                      <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">
                        <ArrowDownCircle className="w-3.5 h-3.5" /> Entrada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-xs font-medium">
                        <ArrowUpCircle className="w-3.5 h-3.5" /> Saída
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{m.quantidade} {m.product.unidade}</td>
                  <td className="px-4 py-3 text-gray-500">{m.usuarioNome}</td>
                  <td className="px-4 py-3 text-gray-500">{m.observacao || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
