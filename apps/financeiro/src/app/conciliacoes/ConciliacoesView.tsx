"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorMes } from "@/components/SeletorMes";
import type { Empreendimento, Unidade } from "@/components/SeletorCentroCusto";
import type { ContaParaSelect } from "@/components/RepetirLancamentoModal";
import type { NovoLancamentoConciliacao } from "@praxis/core";
import { type ItemPendente } from "./ConciliacaoDetalhe";
import { ConciliacaoCardCompacto } from "./ConciliacaoCardCompacto";

// Tela de Conciliações — 2º redesign (pedido do Felipe, 06/08/2026):
// "precisa ser mais rápida (...) conciliar uma quantidade grande de
// lançamentos no menor tempo possível". Virou uma grade de cards
// COMPACTOS, um por lançamento pendente, cada um já com a proposta do
// sistema pré-preenchida (previsto sugerido com confiança ≥70%, ou
// categoria aprendida do histórico com confiança ≥55% — ver
// sugestao-categoria.ts) e um checkbox: pré-marcado quando a proposta está
// pronta pra ir sozinha, desmarcado (e desabilitado até o usuário
// completar) quando o sistema não conseguiu propor nada com confiança.
// Botão único "Conciliar selecionados" no topo manda tudo que estiver
// marcado numa chamada só (POST /api/conciliacao { lote }). Categoria e
// centro de custo abrem em popup pra não derrubar a altura do card. Quem
// precisar de recorrência/anexos/busca manual expande o card (mesmo editor
// completo de antes, ConciliacaoDetalhe, só que agora é a exceção).

type Categoria = { id: string; nome: string; tipo: string; bloco: string };

export interface PropostaLote {
  checked: boolean;
  modo: "previsto" | "novo";
  previstoId: string;
  categoriaId: string;
  centroCustoTipo: "ADMINISTRACAO" | "EMPREENDIMENTO" | "UNIDADE";
  propertyId: string | null;
  uhId: string | null;
}

const CONFIANCA_MINIMA_PREVISTO = 70;
const CONFIANCA_MINIMA_CATEGORIA = 55; // mesmo limiar do card "Novo lançamento" individual (ConciliacaoDetalhe.tsx)

function propostaInicial(item: ItemPendente): PropostaLote {
  if (item.melhorSugestao && (item.melhorSugestao.confianca ?? 0) >= CONFIANCA_MINIMA_PREVISTO) {
    return {
      checked: true,
      modo: "previsto",
      previstoId: item.melhorSugestao.id,
      categoriaId: "",
      centroCustoTipo: "ADMINISTRACAO",
      propertyId: null,
      uhId: null,
    };
  }
  if (item.categoriaSugerida && item.categoriaSugerida.confianca >= CONFIANCA_MINIMA_CATEGORIA) {
    return {
      checked: true,
      modo: "novo",
      previstoId: "",
      categoriaId: item.categoriaSugerida.categoriaId,
      centroCustoTipo: "ADMINISTRACAO",
      propertyId: null,
      uhId: null,
    };
  }
  return { checked: false, modo: "novo", previstoId: "", categoriaId: "", centroCustoTipo: "ADMINISTRACAO", propertyId: null, uhId: null };
}

function propostaPronta(p: PropostaLote): boolean {
  if (p.modo === "previsto") return Boolean(p.previstoId);
  if (!p.categoriaId) return false;
  if (p.centroCustoTipo === "EMPREENDIMENTO") return Boolean(p.propertyId);
  if (p.centroCustoTipo === "UNIDADE") return Boolean(p.uhId);
  return true;
}

export function ConciliacoesView() {
  const [mes, setMes] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7));
  const [pendentes, setPendentes] = useState<ItemPendente[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [contas, setContas] = useState<ContaParaSelect[]>([]);
  const [loading, setLoading] = useState(true);
  const [propostas, setPropostas] = useState<Map<string, PropostaLote>>(new Map());
  const [conciliandoLote, setConciliandoLote] = useState(false);
  const [resultado, setResultado] = useState("");

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
    setPropostas(new Map(itens.map((item) => [item.lancamento.id, propostaInicial(item)])));
    if (resC.ok) setCategorias(await resC.json());
    if (resE.ok) setEmpreendimentos(await resE.json());
    if (resU.ok) setUnidades(await resU.json());
    if (resCt.ok) {
      const data = await resCt.json();
      const contasConectadas: { instituicao: string; contas: { id: string; nome: string }[] }[] = data.contasConectadas || [];
      setContas(contasConectadas.flatMap((cc) => cc.contas.map((c) => ({ id: c.id, nome: c.nome, instituicao: cc.instituicao }))));
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  function atualizarProposta(lancamentoId: string, updates: Partial<PropostaLote>) {
    setPropostas((prev) => {
      const atual = prev.get(lancamentoId);
      if (!atual) return prev;
      const next = new Map(prev);
      next.set(lancamentoId, { ...atual, ...updates });
      return next;
    });
  }

  const selecionados = useMemo(
    () => pendentes.filter((item) => {
      const p = propostas.get(item.lancamento.id);
      return p && p.checked && propostaPronta(p);
    }),
    [pendentes, propostas]
  );

  async function conciliarSelecionados() {
    if (selecionados.length === 0) return;
    setConciliandoLote(true);
    setResultado("");
    try {
      const lote = selecionados.map((item) => {
        const p = propostas.get(item.lancamento.id)!;
        if (p.modo === "previsto") {
          return {
            lancamentoId: item.lancamento.id,
            previstoId: p.previstoId,
            mesReferencia: (item.lancamento.dataCompetencia || item.lancamento.dataVencimento).slice(0, 7),
          };
        }
        const novo: NovoLancamentoConciliacao = {
          descricao: item.lancamento.descricao,
          categoriaId: p.categoriaId,
          centroCustoTipo: p.centroCustoTipo,
          propertyId: p.centroCustoTipo === "EMPREENDIMENTO" ? p.propertyId : null,
          uhId: p.centroCustoTipo === "UNIDADE" ? p.uhId : null,
          dataVencimento: item.lancamento.dataVencimento,
          recorrente: false,
        };
        return { lancamentoId: item.lancamento.id, novo };
      });
      const res = await apiFetch("/api/conciliacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lote }) });
      const data = await res.json().catch(() => ({ ok: 0, total: lote.length, erros: [] }));
      const falhas = data.erros?.length || 0;
      setResultado(
        `${data.ok || 0} lançamento${(data.ok || 0) !== 1 ? "s" : ""} conciliado${(data.ok || 0) !== 1 ? "s" : ""}.` + (falhas > 0 ? ` ${falhas} falharam — confira os cards restantes.` : "")
      );
      carregar();
    } finally {
      setConciliandoLote(false);
    }
  }

  const prontosParaLote = pendentes.filter((item) => {
    const p = propostas.get(item.lancamento.id);
    return p && propostaPronta(p);
  }).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Conciliações</h1>
          <p className="text-xs text-gray-400">{loading ? "Carregando..." : `${pendentes.length} lançamento${pendentes.length !== 1 ? "s" : ""} pendente${pendentes.length !== 1 ? "s" : ""} de conciliação`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SeletorMes mes={mes} onChange={setMes} />
          <button
            onClick={conciliarSelecionados}
            disabled={selecionados.length === 0 || conciliandoLote}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-40 disabled:hover:bg-blue-700 rounded-lg px-3 py-2 flex-shrink-0"
          >
            {conciliandoLote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {conciliandoLote ? "Conciliando..." : `Conciliar selecionados (${selecionados.length})`}
          </button>
        </div>
      </div>

      {!loading && pendentes.length > 0 && (
        <p className="text-xs text-gray-400">
          {prontosParaLote} de {pendentes.length} já têm proposta pronta ({selecionados.length} marcado{selecionados.length !== 1 ? "s" : ""} pra conciliar agora).
        </p>
      )}

      {resultado && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{resultado}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : pendentes.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum lançamento pendente de conciliação neste mês. 🎉</p>
      ) : (
        <div className="space-y-1.5">
          {pendentes.map((item) => {
            const proposta = propostas.get(item.lancamento.id);
            if (!proposta) return null;
            return (
              <ConciliacaoCardCompacto
                key={item.lancamento.id}
                item={item}
                categorias={categorias}
                empreendimentos={empreendimentos}
                unidades={unidades}
                contas={contas}
                proposta={proposta}
                pronta={propostaPronta(proposta)}
                onChangeProposta={(updates) => atualizarProposta(item.lancamento.id, updates)}
                onConciliado={carregar}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
