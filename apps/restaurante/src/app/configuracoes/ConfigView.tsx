"use client";
import { useEffect, useState } from "react";
import { Plus, Package, EyeOff, Eye } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type ProdutoEstoque = { id: string; nome: string; unidade: string; quantidade: number; categoria: string };
type Item = {
  id: string;
  nome: string;
  descricao: string | null;
  quantidadePorPorcao: number;
  ativo: boolean;
  stockProduct: { id: string; nome: string; unidade: string; quantidade: number };
};
type Secao = { id: string; nome: string; limiteSingle: number; ativo: boolean; items: Item[] };

export function ConfigView() {
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Nova seção
  const [novaSecao, setNovaSecao] = useState("");
  const [novoLimite, setNovoLimite] = useState("2");

  // Novo item (por seção)
  const [itemSecaoId, setItemSecaoId] = useState<string | null>(null);
  const [itemNome, setItemNome] = useState("");
  const [itemDescricao, setItemDescricao] = useState("");
  const [itemPorcao, setItemPorcao] = useState("1");
  const [itemProdutoId, setItemProdutoId] = useState("");
  const [criarProdutoNovo, setCriarProdutoNovo] = useState(false);
  const [novoProdUnidade, setNovoProdUnidade] = useState("un");
  const [novoProdQtd, setNovoProdQtd] = useState("0");
  const [novoProdMinimo, setNovoProdMinimo] = useState("0");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const [resSec, resProd] = await Promise.all([
      apiFetch("/api/secoes"),
      apiFetch("/api/estoque-produtos"),
    ]);
    if (resSec.ok) setSecoes(await resSec.json());
    if (resProd.ok) setProdutos(await resProd.json());
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function criarSecao() {
    if (!novaSecao.trim()) return;
    setSalvando(true);
    const res = await apiFetch("/api/secoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novaSecao, limiteSingle: Number(novoLimite) || 2, ordem: secoes.length }),
    });
    setSalvando(false);
    if (res.ok) {
      setNovaSecao("");
      setNovoLimite("2");
      carregar();
    }
  }

  async function atualizarSecao(id: string, data: Record<string, unknown>) {
    await apiFetch("/api/secoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    carregar();
  }

  function abrirNovoItem(secaoId: string) {
    setItemSecaoId(secaoId);
    setItemNome("");
    setItemDescricao("");
    setItemPorcao("1");
    setItemProdutoId("");
    setCriarProdutoNovo(false);
    setErro(null);
  }

  async function criarItem() {
    if (!itemSecaoId || !itemNome.trim()) return;
    if (!criarProdutoNovo && !itemProdutoId) {
      setErro("Vincule um produto do estoque ou cadastre um novo.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const secao = secoes.find((s) => s.id === itemSecaoId);
    const res = await apiFetch("/api/itens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sectionId: itemSecaoId,
        nome: itemNome,
        descricao: itemDescricao,
        quantidadePorPorcao: Number(itemPorcao) || 1,
        ordem: secao?.items.length ?? 0,
        ...(criarProdutoNovo
          ? {
              novoProduto: {
                nome: itemNome,
                categoria: "RESTAURANTE",
                unidade: novoProdUnidade,
                quantidade: Number(novoProdQtd) || 0,
                estoqueMinimo: Number(novoProdMinimo) || 0,
              },
            }
          : { stockProductId: itemProdutoId }),
      }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(data.error || `Erro ${res.status}`);
      return;
    }
    setItemSecaoId(null);
    carregar();
  }

  async function atualizarItem(id: string, data: Record<string, unknown>) {
    await apiFetch("/api/itens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    carregar();
  }

  if (loading) return <p className="text-gray-500 text-sm">Carregando...</p>;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Configurações do Cardápio</h1>
        <p className="text-sm text-gray-500">
          Seções e produtos oferecidos ao hóspede. Todo item é vinculado a um produto do Estoque —
          a entrega dá baixa automática.
        </p>
      </div>

      {/* Nova seção */}
      <div className="card mb-6">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova seção
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input className="input flex-1" placeholder="ex: Boulangerie" value={novaSecao} onChange={(e) => setNovaSecao(e.target.value)} />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 whitespace-nowrap">Limite (single):</label>
            <input className="input w-20" type="number" min={1} value={novoLimite} onChange={(e) => setNovoLimite(e.target.value)} />
          </div>
          <button onClick={criarSecao} disabled={salvando || !novaSecao.trim()} className="btn-primary whitespace-nowrap">
            Criar seção
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">No café double, o limite por seção vale em dobro automaticamente.</p>
      </div>

      {/* Seções existentes */}
      <div className="space-y-5">
        {secoes.map((s) => (
          <div key={s.id} className={`card ${!s.ativo ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-gray-900">{s.nome}</h2>
                <span className="text-xs text-gray-400">limite single: {s.limiteSingle} · double: {s.limiteSingle * 2}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input w-16 py-1 text-sm"
                  type="number"
                  min={1}
                  defaultValue={s.limiteSingle}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v && v !== s.limiteSingle) atualizarSecao(s.id, { limiteSingle: v });
                  }}
                  title="Limite de itens (single)"
                />
                <button
                  onClick={() => atualizarSecao(s.id, { ativo: !s.ativo })}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700"
                  title={s.ativo ? "Ocultar seção do cardápio" : "Reexibir seção"}
                >
                  {s.ativo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {s.items.map((i) => (
                <div key={i.id} className={`flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2 ${!i.ativo ? "opacity-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm">{i.nome}</p>
                    {i.descricao && <p className="text-xs text-gray-500">{i.descricao}</p>}
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      {i.stockProduct.nome} · {i.quantidadePorPorcao} {i.stockProduct.unidade}/porção · saldo {i.stockProduct.quantidade}
                    </p>
                  </div>
                  <input
                    className="input w-20 py-1 text-sm flex-shrink-0"
                    type="number"
                    step="0.01"
                    min={0.01}
                    defaultValue={i.quantidadePorPorcao}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== i.quantidadePorPorcao) atualizarItem(i.id, { quantidadePorPorcao: v });
                    }}
                    title="Quanto do produto de estoque uma porção consome"
                  />
                  <button
                    onClick={() => atualizarItem(i.id, { ativo: !i.ativo })}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 flex-shrink-0"
                    title={i.ativo ? "Ocultar do cardápio" : "Reexibir"}
                  >
                    {i.ativo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>

            {itemSecaoId === s.id ? (
              <div className="mt-3 border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Nome no cardápio</label>
                    <input className="input" value={itemNome} onChange={(e) => setItemNome(e.target.value)} placeholder="ex: Croissant" />
                  </div>
                  <div>
                    <label className="label">Descrição (opcional)</label>
                    <input className="input" value={itemDescricao} onChange={(e) => setItemDescricao(e.target.value)} placeholder="ex: folhado na manteiga" />
                  </div>
                </div>

                <div>
                  <label className="label">Produto do estoque</label>
                  {!criarProdutoNovo ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select className="input flex-1" value={itemProdutoId} onChange={(e) => setItemProdutoId(e.target.value)}>
                        <option value="">Selecionar produto existente...</option>
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>{p.nome} ({p.quantidade} {p.unidade})</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setCriarProdutoNovo(true)} className="btn-secondary text-sm whitespace-nowrap">
                        + Cadastrar produto novo
                      </button>
                    </div>
                  ) : (
                    <div className="border border-gray-200 bg-white rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-2">
                        Produto novo <strong>“{itemNome || "..."}”</strong> será criado também no módulo Estoque (categoria RESTAURANTE).
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="label text-xs">Unidade</label>
                          <input className="input py-1.5" value={novoProdUnidade} onChange={(e) => setNovoProdUnidade(e.target.value)} />
                        </div>
                        <div>
                          <label className="label text-xs">Qtd inicial</label>
                          <input className="input py-1.5" type="number" min={0} value={novoProdQtd} onChange={(e) => setNovoProdQtd(e.target.value)} />
                        </div>
                        <div>
                          <label className="label text-xs">Mínimo</label>
                          <input className="input py-1.5" type="number" min={0} value={novoProdMinimo} onChange={(e) => setNovoProdMinimo(e.target.value)} />
                        </div>
                      </div>
                      <button type="button" onClick={() => setCriarProdutoNovo(false)} className="text-xs text-gray-500 underline mt-2">
                        Voltar a usar produto existente
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Consumo por porção:</label>
                    <input className="input w-24 py-1.5" type="number" step="0.01" min={0.01} value={itemPorcao} onChange={(e) => setItemPorcao(e.target.value)} />
                  </div>
                  <p className="text-xs text-gray-400">1 = unidade inteira; 0.1 = fração (ex: porção de geleia)</p>
                </div>

                {erro && <p className="text-sm text-red-600">{erro}</p>}
                <div className="flex gap-2">
                  <button onClick={criarItem} disabled={salvando || !itemNome.trim()} className="btn-primary text-sm">
                    {salvando ? "Salvando..." : "Adicionar item"}
                  </button>
                  <button onClick={() => setItemSecaoId(null)} className="btn-secondary text-sm">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => abrirNovoItem(s.id)} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900">
                <Plus className="w-4 h-4" /> Adicionar item
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
