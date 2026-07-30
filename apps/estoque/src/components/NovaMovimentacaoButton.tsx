"use client";
import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type Produto = { id: string; nome: string; unidade: string; quantidade: number };

// Botão + modal de "Nova Movimentação", reusado em Dashboard, Produtos e
// Movimentações (30/07/2026, pedido do Felipe pra estar presente nas 3
// telas) — busca a lista de produtos só quando abre (não acopla ao estado
// já carregado de cada tela, cada uma continua responsável só pelos próprios
// dados). onRegistrada roda depois de um POST /api/movimentos com sucesso,
// pra cada tela recarregar o que exibe.
export function NovaMovimentacaoButton({ onRegistrada }: { onRegistrada?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function abrir() {
    setTipo("ENTRADA");
    setQtd("");
    setObs("");
    setErro("");
    setAberto(true);
    setCarregandoProdutos(true);
    const res = await apiFetch("/api/produtos");
    if (res.ok) {
      const lista = await res.json();
      setProdutos(lista);
      setProdutoId(lista[0]?.id || "");
    }
    setCarregandoProdutos(false);
  }

  async function confirmar() {
    if (!produtoId || !qtd || Number(qtd) <= 0) {
      setErro("Selecione o produto e uma quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await apiFetch("/api/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: produtoId, tipo, quantidade: qtd, observacao: obs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.error || "Erro ao registrar movimentação.");
        return;
      }
      setAberto(false);
      onRegistrada?.();
    } finally {
      setSalvando(false);
    }
  }

  const produtoSelecionado = produtos.find((p) => p.id === produtoId);

  return (
    <>
      <button onClick={abrir} className="btn-primary flex items-center gap-2 justify-center">
        <Plus className="w-4 h-4" /> Nova Movimentação
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nova Movimentação</h2>
              <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {carregandoProdutos ? (
              <p className="text-sm text-gray-500">Carregando produtos...</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label">Produto</label>
                  <select className="input" value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                    {produtos.length === 0 && <option value="">Nenhum produto cadastrado</option>}
                    {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTipo("ENTRADA")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium ${
                      tipo === "ENTRADA" ? "border-green-600 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"
                    }`}
                  >
                    <ArrowDownCircle className="w-4 h-4" /> Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo("SAIDA")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium ${
                      tipo === "SAIDA" ? "border-red-600 bg-red-50 text-red-700" : "border-gray-200 text-gray-500"
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
                  <input className="input" type="number" min="0" step="0.01" autoFocus value={qtd} onChange={(e) => setQtd(e.target.value)} />
                </div>
                <div>
                  <label className="label">Observação (opcional)</label>
                  <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-secondary" onClick={() => setAberto(false)}>Cancelar</button>
              <button
                className={tipo === "ENTRADA" ? "btn-success" : "btn-danger"}
                onClick={confirmar}
                disabled={salvando || carregandoProdutos || !produtoId || !qtd || Number(qtd) <= 0}
              >
                {salvando ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
