"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, ArrowDownCircle, ArrowUpCircle, AlertTriangle, X, Archive, ArchiveRestore } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type Produto = {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  estoqueMinimo: number;
  custo: number | null;
  fornecedor: string | null;
  ativo: boolean;
};

const emptyForm = { nome: "", categoria: "", unidade: "un", quantidade: "0", estoqueMinimo: "0", custo: "", fornecedor: "" };

export function ProdutosView() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [busca, setBusca] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const [movProduto, setMovProduto] = useState<Produto | null>(null);
  const [movTipo, setMovTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [movQtd, setMovQtd] = useState("");
  const [movObs, setMovObs] = useState("");
  const [movSalvando, setMovSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    const res = await apiFetch(`/api/produtos${incluirInativos ? "?incluirInativos=1" : ""}`);
    if (res.ok) setProdutos(await res.json());
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [incluirInativos]);

  function abrirNovo() {
    setEditando(null);
    setForm(emptyForm);
    setErro("");
    setShowForm(true);
  }

  function abrirEdicao(p: Produto) {
    setEditando(p);
    setForm({
      nome: p.nome,
      categoria: p.categoria,
      unidade: p.unidade,
      quantidade: String(p.quantidade),
      estoqueMinimo: String(p.estoqueMinimo),
      custo: p.custo != null ? String(p.custo) : "",
      fornecedor: p.fornecedor || "",
    });
    setErro("");
    setShowForm(true);
  }

  async function salvar() {
    if (!form.nome.trim() || !form.categoria.trim()) {
      setErro("Nome e categoria são obrigatórios.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = editando
        ? await apiFetch("/api/produtos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editando.id,
              nome: form.nome,
              categoria: form.categoria,
              unidade: form.unidade,
              estoqueMinimo: form.estoqueMinimo,
              custo: form.custo,
              fornecedor: form.fornecedor,
            }),
          })
        : await apiFetch("/api/produtos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.error || "Erro ao salvar.");
        return;
      }
      setShowForm(false);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(p: Produto) {
    await apiFetch("/api/produtos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, ativo: !p.ativo }),
    });
    await carregar();
  }

  function abrirMovimentacao(p: Produto, tipo: "ENTRADA" | "SAIDA") {
    setMovProduto(p);
    setMovTipo(tipo);
    setMovQtd("");
    setMovObs("");
  }

  async function confirmarMovimentacao() {
    if (!movProduto || !movQtd || Number(movQtd) <= 0) return;
    setMovSalvando(true);
    try {
      const res = await apiFetch("/api/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: movProduto.id, tipo: movTipo, quantidade: movQtd, observacao: movObs }),
      });
      if (res.ok) {
        setMovProduto(null);
        await carregar();
      }
    } finally {
      setMovSalvando(false);
    }
  }

  const filtrados = produtos.filter((p) =>
    !busca.trim() ||
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    p.categoria.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-500">Estoque de insumos — {produtos.length} produto{produtos.length === 1 ? "" : "s"}</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary flex items-center gap-2 justify-center">
          <Plus className="w-4 h-4" /> Novo Produto
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className="input sm:max-w-xs"
          placeholder="Buscar por nome ou categoria..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <div className="card text-center text-gray-500 text-sm py-8">Nenhum produto encontrado.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-left px-4 py-3">Categoria</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="text-right px-4 py-3">Mínimo</th>
                <th className="text-left px-4 py-3">Fornecedor</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((p) => {
                const baixo = p.quantidade <= p.estoqueMinimo;
                return (
                  <tr key={p.id} className={!p.ativo ? "opacity-50" : ""}>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                    <td className="px-4 py-3 text-gray-500">{p.categoria}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 font-medium ${baixo ? "text-red-600" : "text-gray-900"}`}>
                        {baixo && <AlertTriangle className="w-3.5 h-3.5" />}
                        {p.quantidade} {p.unidade}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{p.estoqueMinimo} {p.unidade}</td>
                    <td className="px-4 py-3 text-gray-500">{p.fornecedor || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Entrada" onClick={() => abrirMovimentacao(p, "ENTRADA")} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                          <ArrowDownCircle className="w-4 h-4" />
                        </button>
                        <button title="Saída" onClick={() => abrirMovimentacao(p, "SAIDA")} className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                          <ArrowUpCircle className="w-4 h-4" />
                        </button>
                        <button title="Editar" onClick={() => abrirEdicao(p)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button title={p.ativo ? "Inativar" : "Reativar"} onClick={() => alternarAtivo(p)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                          {p.ativo ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{editando ? "Editar Produto" : "Novo Produto"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Nome</label>
                <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoria</label>
                  <input className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="LIMPEZA, AMENITIES..." />
                </div>
                <div>
                  <label className="label">Unidade</label>
                  <input className="input" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="un, L, kg..." />
                </div>
              </div>
              {!editando && (
                <div>
                  <label className="label">Quantidade inicial</label>
                  <input className="input" type="number" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Estoque mínimo</label>
                  <input className="input" type="number" value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })} />
                </div>
                <div>
                  <label className="label">Custo (R$)</label>
                  <input className="input" type="number" step="0.01" value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Fornecedor</label>
                <input className="input" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
              </div>
              {erro && <p className="text-sm text-red-600">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {movProduto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">
                {movTipo === "ENTRADA" ? "Registrar Entrada" : "Registrar Saída"} — {movProduto.nome}
              </h2>
              <button onClick={() => setMovProduto(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Saldo atual: {movProduto.quantidade} {movProduto.unidade}</p>
            <div className="space-y-3">
              <div>
                <label className="label">Quantidade ({movProduto.unidade})</label>
                <input className="input" type="number" min="0" step="0.01" autoFocus value={movQtd} onChange={(e) => setMovQtd(e.target.value)} />
              </div>
              <div>
                <label className="label">Observação (opcional)</label>
                <textarea className="input" rows={2} value={movObs} onChange={(e) => setMovObs(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-secondary" onClick={() => setMovProduto(null)}>Cancelar</button>
              <button
                className={movTipo === "ENTRADA" ? "btn-success" : "btn-danger"}
                onClick={confirmarMovimentacao}
                disabled={movSalvando || !movQtd || Number(movQtd) <= 0}
              >
                {movSalvando ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
