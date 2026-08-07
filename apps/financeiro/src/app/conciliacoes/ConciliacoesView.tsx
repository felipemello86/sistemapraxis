"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorMes } from "@/components/SeletorMes";
import type { Empreendimento, Unidade } from "@/components/SeletorCentroCusto";
import type { ContaParaSelect } from "@/components/RepetirLancamentoModal";
import type { NovoLancamentoConciliacao } from "@praxis/core";
import { type ItemPendente, pareceParcelado } from "./ConciliacaoDetalhe";
import { ConciliacaoCardCompacto } from "./ConciliacaoCardCompacto";
import { GRID_COLUNAS } from "./gridColunas";

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
  // Compra parcelada (pedido do Felipe, 06/08/2026): sem um previsto já
  // esperando por ela (checado acima), não dá pra criar sozinho um "novo
  // lançamento" em lote — o número de parcelas não tem como o sistema
  // adivinhar (a descrição não traz essa informação), e sem ele o valor
  // certo (total ÷ parcelas) também não dá pra calcular. Fica sempre
  // desmarcado, mesmo que a categoria tenha sido aprendida com confiança —
  // o card mostra um aviso pra abrir o detalhe e configurar (ver
  // ConciliacaoCardCompacto.tsx).
  if (pareceParcelado(item.lancamento.descricao)) {
    return {
      checked: false,
      modo: "novo",
      previstoId: "",
      categoriaId: item.categoriaSugerida?.categoriaId ?? "",
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

// Colunas organizáveis (pedido do Felipe, 06/08/2026): "reorganize como
// colunas organizáveis: Lançamento / Vencimento / Conta / Descrição / Valor".
// "Lançamento" = Data de Competência (com fallback pro Vencimento quando não
// há competência informada), mesma convenção da coluna "Data" de
// LancamentosView.tsx.
type SortField = "lancamento" | "vencimento" | "conta" | "descricao" | "valor";

function propostaPronta(item: ItemPendente, p: PropostaLote): boolean {
  if (p.modo === "previsto") return Boolean(p.previstoId);
  if (pareceParcelado(item.lancamento.descricao)) return false; // sempre exige abrir o detalhe pra informar o nº de parcelas
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
  const [sortField, setSortField] = useState<SortField>("vencimento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function alternarSort(campo: SortField) {
    if (sortField === campo) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(campo);
      setSortDir("asc");
    }
  }

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

  const contaPorId = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);

  const pendentesOrdenados = useMemo(() => {
    function valorOrdenacao(item: ItemPendente): string | number {
      switch (sortField) {
        case "lancamento":
          return item.lancamento.dataCompetencia || item.lancamento.dataVencimento;
        case "vencimento":
          return item.lancamento.dataVencimento;
        case "conta":
          return (item.lancamento.contaBancariaId && contaPorId.get(item.lancamento.contaBancariaId)) || "";
        case "descricao":
          return item.lancamento.descricao;
        case "valor":
          return Number(item.lancamento.valor);
      }
    }
    const copia = [...pendentes];
    copia.sort((a, b) => {
      const va = valorOrdenacao(a);
      const vb = valorOrdenacao(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [pendentes, sortField, sortDir, contaPorId]);

  const selecionados = useMemo(
    () => pendentes.filter((item) => {
      const p = propostas.get(item.lancamento.id);
      return p && p.checked && propostaPronta(item, p);
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
    return p && propostaPronta(item, p);
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
          {/* Cabeçalho de colunas ordenáveis (pedido do Felipe, 06/08/2026):
              "reorganize como colunas organizáveis: Lançamento / Vencimento /
              Conta / Descrição / Valor". Mesmo GRID_COLUNAS dos cards, pra
              ficar tudo alinhado; o espaçador de 20px no início corresponde
              ao checkbox (w-4 + gap-2) de cada card. */}
          <div className="flex items-center gap-2 px-3 text-[11px] text-gray-400 font-medium select-none">
            <div className="w-4 flex-shrink-0" />
            <div className={`flex-1 min-w-0 grid ${GRID_COLUNAS} gap-x-3`}>
              {(
                [
                  ["lancamento", "Lançamento"],
                  ["vencimento", "Vencimento"],
                  ["conta", "Conta"],
                  ["descricao", "Descrição"],
                  ["valor", "Valor"],
                ] as [SortField, string][]
              ).map(([campo, rotulo]) => (
                <button
                  key={campo}
                  type="button"
                  onClick={() => alternarSort(campo)}
                  className={`flex items-center gap-0.5 hover:text-gray-600 ${campo === "valor" ? "justify-end" : ""}`}
                >
                  {rotulo}
                  {sortField === campo && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                </button>
              ))}
              <span />
            </div>
          </div>

          {pendentesOrdenados.map((item) => {
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
                pronta={propostaPronta(item, proposta)}
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
