"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorMes } from "@/components/SeletorMes";
import type { Empreendimento, Unidade } from "@/components/SeletorCentroCusto";
import type { ContaParaSelect } from "@/components/RepetirLancamentoModal";
import { ConciliacaoDetalhe, type ItemPendente } from "./ConciliacaoDetalhe";

// Tela de Conciliações — redesenhada em 06/08/2026 (pedido do Felipe,
// espelhando o Conta Azul): lista compacta dos lançamentos importados
// ainda pendentes à esquerda + o par de cards conectáveis (banco / proposto)
// pro item selecionado à direita (ver ConciliacaoDetalhe.tsx). O fluxo
// antigo (uma linha por lançamento com um <select> de sugestões, tudo em
// lote) continua disponível como atalho rápido no topo — "confirmar as com
// sugestão forte de uma vez" — pra quem só quer bater o olho e aprovar.

type Categoria = { id: string; nome: string; tipo: string; bloco: string };

export function ConciliacoesView() {
  const [mes, setMes] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7));
  const [pendentes, setPendentes] = useState<ItemPendente[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [contas, setContas] = useState<ContaParaSelect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [confirmandoLote, setConfirmandoLote] = useState(false);
  const [resultado, setResultado] = useState("");

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  async function carregar() {
    setLoading(true);
    setResultado("");
    const [resP, resC, resE, resU, resCt] = await Promise.all([
      apiFetch(`/api/conciliacao?mes=${mes}`),
      apiFetch("/api/categorias"),
      apiFetch("/api/empreendimentos"),
      apiFetch("/api/unidades"),
      apiFetch("/api/contas"),
    ]);
    const itens: ItemPendente[] = resP.ok ? await resP.json() : [];
    setPendentes(itens);
    if (resC.ok) setCategorias(await resC.json());
    if (resE.ok) setEmpreendimentos(await resE.json());
    if (resU.ok) setUnidades(await resU.json());
    if (resCt.ok) {
      const data = await resCt.json();
      const contasConectadas: { instituicao: string; contas: { id: string; nome: string }[] }[] = data.contasConectadas || [];
      setContas(contasConectadas.flatMap((cc) => cc.contas.map((c) => ({ id: c.id, nome: c.nome, instituicao: cc.instituicao }))));
    }
    setSelecionadoId((prev) => (prev && itens.some((i) => i.lancamento.id === prev) ? prev : itens[0]?.lancamento.id ?? null));
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function confirmarComSugestaoForte() {
    const alvos = pendentes.filter((p) => p.melhorSugestao && (p.melhorSugestao.confianca ?? 0) >= 70);
    if (alvos.length === 0) return;
    setConfirmandoLote(true);
    setResultado("");
    try {
      const confirmacoes = alvos.map((p) => ({
        lancamentoId: p.lancamento.id,
        previstoId: p.melhorSugestao!.id,
        mesReferencia: (p.lancamento.dataCompetencia || p.lancamento.dataVencimento).slice(0, 7),
      }));
      const res = await apiFetch("/api/conciliacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmacoes }) });
      const data = await res.json().catch(() => ({ ok: 0, erros: [] }));
      setResultado(`${data.ok || 0} conciliação${(data.ok || 0) !== 1 ? "ões" : ""} confirmada${(data.ok || 0) !== 1 ? "s" : ""} automaticamente.`);
      carregar();
    } finally {
      setConfirmandoLote(false);
    }
  }

  function formatBRL(v: string | number): string {
    const n = typeof v === "string" ? Number(v) : v;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatDataBR(iso: string): string {
    const [ano, m, dia] = iso.split("-");
    return `${dia}/${m}`;
  }

  const itemSelecionado = pendentes.find((p) => p.lancamento.id === selecionadoId) ?? null;
  const comSugestaoForte = pendentes.filter((p) => p.melhorSugestao && (p.melhorSugestao.confianca ?? 0) >= 70).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-gray-900">Conciliações</h1>
        <SeletorMes mes={mes} onChange={setMes} />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : pendentes.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum lançamento pendente de conciliação neste mês. 🎉</p>
      ) : (
        <>
          {comSugestaoForte > 0 && (
            <div className="flex items-center justify-between gap-2 bg-blue-50 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-800">{comSugestaoForte} lançamento(s) com sugestão forte (≥70%) — pode confirmar tudo de uma vez.</p>
              <button
                onClick={confirmarComSugestaoForte}
                disabled={confirmandoLote}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-3 py-1.5 flex-shrink-0"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {confirmandoLote ? "Confirmando..." : "Confirmar automáticas"}
              </button>
            </div>
          )}

          {resultado && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{resultado}</p>}

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
            <div className="card !p-0 divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {pendentes.map((item) => {
                const ativo = item.lancamento.id === selecionadoId;
                const valorNum = Number(item.lancamento.valor);
                return (
                  <button
                    key={item.lancamento.id}
                    onClick={() => setSelecionadoId(item.lancamento.id)}
                    className={`w-full text-left px-3 py-2.5 ${ativo ? "bg-blue-700 text-white" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate ${ativo ? "text-gray-300" : "text-gray-400"}`}>{formatDataBR(item.lancamento.dataVencimento)}</p>
                      {item.melhorSugestao && (
                        <span className={`text-[10px] font-medium px-1 rounded ${ativo ? "text-blue-300" : (item.melhorSugestao.confianca ?? 0) >= 70 ? "text-green-600" : "text-amber-600"}`}>
                          {item.melhorSugestao.confianca}%
                        </span>
                      )}
                    </div>
                    <p className={`text-sm truncate ${ativo ? "text-white" : "text-gray-800"}`}>{item.lancamento.descricao}</p>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-xs truncate ${ativo ? "text-gray-400" : "text-gray-400"}`}>{categoriaPorId.get(item.lancamento.categoriaId || "") || "sem categoria"}</p>
                      <p className={`text-xs font-semibold flex-shrink-0 ${ativo ? "text-white" : valorNum >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(item.lancamento.valor)}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              {itemSelecionado ? (
                <ConciliacaoDetalhe
                  key={itemSelecionado.lancamento.id}
                  item={itemSelecionado}
                  categorias={categorias}
                  empreendimentos={empreendimentos}
                  unidades={unidades}
                  contas={contas}
                  onConciliado={carregar}
                />
              ) : (
                <p className="text-gray-400 text-sm">Selecione um lançamento à esquerda.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
