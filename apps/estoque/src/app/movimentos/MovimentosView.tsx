"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Plus, X } from "lucide-react";
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

type Produto = { id: string; nome: string; unidade: string; quantidade: number };

export function MovimentosView() {
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  // Registrar nova movimentação — mesmo POST /api/movimentos que o botão de
  // entrada/saída em cada linha de /produtos já usa. Adicionado aqui também
  // (30/07/2026) porque quem procura "lançar entrada/saída" naturalmente
  // olha primeiro pra tela de Movimentações ou pro Dashboard, e antes só
  // existia esse atalho escondido na tela de Produtos.
  const [showForm, setShowForm] = useState(false);
  const [novoProdutoId, setNovoProdutoId] = useState("");
  const [novoTipo, setNovoTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [novoQtd, setNovoQtd] = useState("");
  const [novoObs, setNovoObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

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

  function abrirNova() {
    setNovoProdutoId(produtos[0]?.id || "");
    setNovoTipo("ENTRADA");
    setNovoQtd("");
    setNovoObs("");
    setErro("");
    setShowForm(true);
  }

  async function confirmarNova() {
    if (!novoProdutoId || !novoQtd || Number(novoQtd) <= 0) {
      setErro("Selecione o produto e uma quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await apiFetch("/api/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: novoProdutoId, tipo: novoTipo, quantidade: novoQtd, observacao: novoObs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.error || "Erro ao registrar movimentação.");
        return;
      }
      setShowForm(false);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  const produtoSelecionado = produtos.find((p) => p.id === novoProdutoId);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Movimentações</h1>
          <p className="text-sm text-gray-500">Histórico de entradas e saídas de estoque</p>
        </div>
        <button onClick={abrirNova} className="btn-primary flex items-center gap-2 justify-center">
          <Plus className="w-4 h-4" /> Nova Movimentação
        </button>
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nova Movimentação</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Produto</label>
                <select className="input" value={novoProdutoId} onChange={(e) => setNovoProdutoId(e.target.value)}>
                  {produtos.length === 0 && <option value="">Nenhum produto cadastrado</option>}
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNovoTipo("ENTRADA")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium ${
                    novoTipo === "ENTRADA" ? "border-green-600 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"
                  }`}
                >
                  <ArrowDownCircle className="w-4 h-4" /> Entrada
                </button>
                <button
                  type="button"
                  onClick={() => setNovoTipo("SAIDA")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium ${
                    novoTipo === "SAIDA" ? "border-red-600 bg-red-50 text-red-700" : "border-gray-200 text-gray-500"
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4" /> Saída
                </button>
              </div>
              {produtoSelecionado && (
                <p className="text-sm text-gray-500">Saldo atual: {produtoSelecionado.quantidade} {produtoSelecionado.unidade}</p>
              )}
              <div>
                <label className="label">Quantidade{produtoSelecionado ? ` (${produtoSelecionado.unidade})` : ""}</label>
                <input className="input" type="number" min="0" step="0.01" autoFocus value={novoQtd} onChange={(e) => setNovoQtd(e.target.value)} />
              </div>
              <div>
                <label className="label">Observação (opcional)</label>
                <textarea className="input" rows={2} value={novoObs} onChange={(e) => setNovoObs(e.target.value)} />
              </div>
              {erro && <p className="text-sm text-red-600">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button
                className={novoTipo === "ENTRADA" ? "btn-success" : "btn-danger"}
                onClick={confirmarNova}
                disabled={salvando || !novoProdutoId || !novoQtd || Number(novoQtd) <= 0}
              >
                {salvando ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
