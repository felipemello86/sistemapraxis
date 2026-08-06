"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, X, Search } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorMes } from "./SeletorMes";

// Popup "Buscar lançamento" (pedido do Felipe, 06/08/2026, item 2 do
// redesign de Conciliações): navega a mesma árvore da DRE (Bloco ->
// Categoria -> Lançamentos) até achar o previsto certo pra usar como
// conciliação — reaproveita /api/dre em vez de ter sua própria consulta.
// Só lançamentos `conciliavel=true` (MANUAL, ainda não cumpridos naquele
// mês — ver DreLinhaLancamento em lib/finance/dre.ts) podem ser
// selecionados; o resto aparece esmaecido, só pra contexto.

type DreLinha = {
  id: string;
  categoriaId: string | null;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  projetadaDeRecorrencia: boolean;
  origem: string;
  conciliavel: boolean;
};

type DreCategoria = { categoriaId: string; nome: string; total: string; lancamentos: DreLinha[] };
type DreBlocoResumo = { blocoId: string; nome: string; categorias: DreCategoria[] };
type DreResponse = { blocos: DreBlocoResumo[] };

export type LancamentoEscolhido = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  recorrente: boolean;
  categoriaId: string | null;
};

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function BuscarLancamentoModal({
  open,
  onClose,
  mesInicial,
  onEscolher,
}: {
  open: boolean;
  onClose: () => void;
  mesInicial: string;
  onEscolher: (l: LancamentoEscolhido) => void;
}) {
  const [mes, setMes] = useState(mesInicial);
  const [dre, setDre] = useState<DreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [blocosAbertos, setBlocosAbertos] = useState<Set<string>>(new Set());
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (open) setMes(mesInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mesInicial]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch(`/api/dre?mes=${mes}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDre)
      .finally(() => setLoading(false));
  }, [open, mes]);

  if (!open) return null;

  const buscaLower = busca.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl max-h-[90vh] flex flex-col p-5 gap-3">
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-gray-900">Buscar lançamento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <SeletorMes mes={mes} onChange={setMes} />
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className="input text-sm pl-8 py-1.5 w-full"
              placeholder="Filtrar por descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border border-gray-100 rounded-lg">
          {loading ? (
            <p className="text-gray-400 text-sm p-4">Carregando...</p>
          ) : !dre || dre.blocos.every((b) => b.categorias.length === 0) ? (
            <p className="text-gray-400 text-sm p-4">Nenhum lançamento neste mês.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {dre.blocos.map((bloco) => {
                const categoriasComLinhas = bloco.categorias.filter((c) => c.lancamentos.length > 0);
                if (categoriasComLinhas.length === 0) return null;
                const blocoAberto = blocosAbertos.has(bloco.blocoId);
                return (
                  <div key={bloco.blocoId}>
                    <button
                      className="w-full flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                      onClick={() =>
                        setBlocosAbertos((prev) => {
                          const next = new Set(prev);
                          next.has(bloco.blocoId) ? next.delete(bloco.blocoId) : next.add(bloco.blocoId);
                          return next;
                        })
                      }
                    >
                      {blocoAberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      {bloco.nome}
                    </button>
                    {blocoAberto &&
                      categoriasComLinhas.map((categoria) => {
                        const linhasFiltradas = buscaLower
                          ? categoria.lancamentos.filter((l) => l.descricao.toLowerCase().includes(buscaLower) || (l.fornecedor || "").toLowerCase().includes(buscaLower))
                          : categoria.lancamentos;
                        if (buscaLower && linhasFiltradas.length === 0) return null;
                        const categoriaAberta = categoriasAbertas.has(categoria.categoriaId) || Boolean(buscaLower);
                        return (
                          <div key={categoria.categoriaId} className="pl-4">
                            <button
                              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                              onClick={() =>
                                setCategoriasAbertas((prev) => {
                                  const next = new Set(prev);
                                  next.has(categoria.categoriaId) ? next.delete(categoria.categoriaId) : next.add(categoria.categoriaId);
                                  return next;
                                })
                              }
                            >
                              {categoriaAberta ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              {categoria.nome}
                              <span className="text-gray-300">({linhasFiltradas.length})</span>
                            </button>
                            {categoriaAberta && (
                              <div className="pl-4">
                                {linhasFiltradas.map((l) => (
                                  <button
                                    key={l.id}
                                    disabled={!l.conciliavel}
                                    onClick={() =>
                                      onEscolher({
                                        id: l.id,
                                        descricao: l.descricao,
                                        fornecedor: l.fornecedor,
                                        valor: l.valor,
                                        dataEfetiva: l.dataEfetiva,
                                        recorrente: l.projetadaDeRecorrencia,
                                        categoriaId: l.categoriaId,
                                      })
                                    }
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left border-t border-gray-50 ${
                                      l.conciliavel ? "hover:bg-blue-50 cursor-pointer" : "opacity-40 cursor-not-allowed"
                                    }`}
                                    title={l.conciliavel ? "Usar como conciliação" : "Já é um lançamento real (ou já conciliado) — não pode virar previsto"}
                                  >
                                    <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{l.descricao}</span>
                                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDataBR(l.dataEfetiva)}</span>
                                    <span className="text-xs font-semibold text-gray-700 flex-shrink-0 w-20 text-right">{formatBRL(l.valor)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
