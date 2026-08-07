"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, ArrowUp, ArrowDown, Search } from "lucide-react";
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

// Cópia local de normalizarTexto (fonte: packages/core/src/finance/texto.ts)
// — mesmo motivo de DreView.tsx (mesAdjacenteLocal): um "use client" daqui
// não pode fazer import de VALOR de "@praxis/core", só de tipo, porque o
// index.ts do pacote também reexporta adminSession.ts/session.ts (que usam
// next/headers) e o build do Next quebra tentando bundlar isso no cliente.
function normalizarTextoLocal(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

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
// colunas organizáveis: Lançamento / Vencimento / Conta / Descrição / Valor",
// depois "colocar categoria e centro de custo como colunas também",
// "descrição como filtro de texto" e por fim "Conta/Categoria/Centro de
// Custo devem ser filtráveis". Conta/Categoria/Centro de Custo viraram
// filtro por checkbox (não ordenáveis) — mesmo padrão de Categoria/Status em
// LancamentosView.tsx — só Lançamento/Vencimento/Valor continuam ordenáveis.
// "Lançamento" = Data de Competência (com fallback pro Vencimento quando não
// há competência informada), mesma convenção da coluna "Data" de
// LancamentosView.tsx.
type SortField = "lancamento" | "vencimento" | "valor";

function propostaPronta(item: ItemPendente, p: PropostaLote): boolean {
  if (p.modo === "previsto") return Boolean(p.previstoId);
  if (pareceParcelado(item.lancamento.descricao)) return false; // sempre exige abrir o detalhe pra informar o nº de parcelas
  if (!p.categoriaId) return false;
  if (p.centroCustoTipo === "EMPREENDIMENTO") return Boolean(p.propertyId);
  if (p.centroCustoTipo === "UNIDADE") return Boolean(p.uhId);
  return true;
}

// Cabeçalho de coluna filtrável por checkbox (Conta/Categoria/Centro de
// Custo — pedido do Felipe, 06/08/2026: "as colunas Conta, Categoria e
// Centro de Custo devem ser filtráveis"), mesmo padrão visual do filtro de
// Categoria/Status em LancamentosView.tsx, só que genérico (recebe a lista
// de opções distintas já calculada pelo pai).
function ColunaFiltro({
  rotulo,
  opcoes,
  selecionados,
  aberto,
  onToggleAberto,
  onFechar,
  onAlternar,
  onLimpar,
}: {
  rotulo: string;
  opcoes: string[];
  selecionados: Set<string>;
  aberto: boolean;
  onToggleAberto: () => void;
  onFechar: () => void;
  onAlternar: (valor: string) => void;
  onLimpar: () => void;
}) {
  return (
    <div className="relative min-w-0">
      <button type="button" onClick={onToggleAberto} className={`flex items-center gap-1 hover:text-gray-600 truncate max-w-full ${selecionados.size > 0 ? "text-blue-700" : ""}`}>
        <span className="truncate">
          {rotulo}
          {selecionados.size > 0 ? ` (${selecionados.size})` : ""}
        </span>
      </button>
      {aberto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              onFechar();
            }}
          />
          <div
            className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-56 max-h-72 overflow-y-auto normal-case font-normal"
            onClick={(e) => e.stopPropagation()}
          >
            {selecionados.size > 0 && (
              <button type="button" onClick={onLimpar} className="text-xs text-blue-600 hover:underline mb-1">
                Limpar filtro
              </button>
            )}
            {opcoes.map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 text-xs py-1 cursor-pointer hover:bg-gray-50 px-1 rounded">
                <input type="checkbox" checked={selecionados.has(opt)} onChange={() => onAlternar(opt)} />
                <span className="truncate">{opt}</span>
              </label>
            ))}
            {opcoes.length === 0 && <p className="text-xs text-gray-400 px-1 py-1">Nenhuma opção.</p>}
          </div>
        </>
      )}
    </div>
  );
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
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [descPopoverAberto, setDescPopoverAberto] = useState(false);
  const [filtroContas, setFiltroContas] = useState<Set<string>>(new Set());
  const [filtroCategoriasCol, setFiltroCategoriasCol] = useState<Set<string>>(new Set());
  const [filtroCentrosCusto, setFiltroCentrosCusto] = useState<Set<string>>(new Set());
  const [contaPopoverAberto, setContaPopoverAberto] = useState(false);
  const [categoriaPopoverAberto, setCategoriaPopoverAberto] = useState(false);
  const [centroCustoPopoverAberto, setCentroCustoPopoverAberto] = useState(false);

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
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  // Valores exibidos nas colunas Conta/Categoria/Centro de Custo — usados
  // tanto pro filtro (checkbox por valor distinto, pedido do Felipe,
  // 06/08/2026: "as colunas Conta, Categoria e Centro de Custo devem ser
  // filtráveis") quanto pra render no card (mesma lógica de
  // ConciliacaoCardCompacto.tsx, duplicada aqui pra não levantar estado).
  // "—" cobre tanto "sem conta" quanto "modo previsto" (onde categoria/
  // centro de custo vêm do lançamento previsto casado, não são editáveis
  // aqui).
  function contaExibidaDe(item: ItemPendente): string {
    return (item.lancamento.contaBancariaId && contaPorId.get(item.lancamento.contaBancariaId)) || "—";
  }
  function categoriaExibidaDe(p: PropostaLote | undefined): string {
    if (!p || p.modo !== "novo") return "—";
    return categoriaPorId.get(p.categoriaId) || "Escolher categoria";
  }
  function resumoCentroCustoDe(p: PropostaLote): string {
    if (p.centroCustoTipo === "ADMINISTRACAO") return "Administração";
    if (p.centroCustoTipo === "EMPREENDIMENTO") return empreendimentos.find((e) => e.id === p.propertyId)?.nome || "Empreendimento...";
    return unidades.find((u) => u.id === p.uhId)?.nome || "Unidade...";
  }
  function centroCustoExibidoDe(p: PropostaLote | undefined): string {
    if (!p || p.modo !== "novo") return "—";
    return resumoCentroCustoDe(p);
  }

  const opcoesConta = useMemo(() => Array.from(new Set(pendentes.map(contaExibidaDe))).sort((a, b) => a.localeCompare(b)), [pendentes, contaPorId]);
  const opcoesCategoria = useMemo(
    () => Array.from(new Set(pendentes.map((item) => categoriaExibidaDe(propostas.get(item.lancamento.id))))).sort((a, b) => a.localeCompare(b)),
    [pendentes, propostas, categoriaPorId]
  );
  const opcoesCentroCusto = useMemo(
    () => Array.from(new Set(pendentes.map((item) => centroCustoExibidoDe(propostas.get(item.lancamento.id))))).sort((a, b) => a.localeCompare(b)),
    [pendentes, propostas, empreendimentos, unidades]
  );

  function alternarNoFiltro(atual: Set<string>, setFn: (s: Set<string>) => void, valor: string) {
    const next = new Set(atual);
    if (next.has(valor)) next.delete(valor);
    else next.add(valor);
    setFn(next);
  }

  // Descrição virou filtro de texto (pedido do Felipe, 06/08/2026) — busca
  // acento/maiúscula-insensível via normalizarTexto (mesma normalização
  // usada na sugestão de categoria). Conta/Categoria/Centro de Custo viraram
  // filtro por checkbox de valor exato.
  const pendentesFiltrados = useMemo(() => {
    let lista = pendentes;
    if (filtroDescricao.trim()) {
      const alvo = normalizarTextoLocal(filtroDescricao);
      lista = lista.filter((item) => normalizarTextoLocal(item.lancamento.descricao).includes(alvo));
    }
    if (filtroContas.size > 0) lista = lista.filter((item) => filtroContas.has(contaExibidaDe(item)));
    if (filtroCategoriasCol.size > 0) lista = lista.filter((item) => filtroCategoriasCol.has(categoriaExibidaDe(propostas.get(item.lancamento.id))));
    if (filtroCentrosCusto.size > 0) lista = lista.filter((item) => filtroCentrosCusto.has(centroCustoExibidoDe(propostas.get(item.lancamento.id))));
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendentes, filtroDescricao, filtroContas, filtroCategoriasCol, filtroCentrosCusto, propostas, contaPorId, categoriaPorId, empreendimentos, unidades]);

  const pendentesOrdenados = useMemo(() => {
    function valorOrdenacao(item: ItemPendente): string | number {
      switch (sortField) {
        case "lancamento":
          return item.lancamento.dataCompetencia || item.lancamento.dataVencimento;
        case "vencimento":
          return item.lancamento.dataVencimento;
        case "valor":
          return Number(item.lancamento.valor);
      }
    }
    const copia = [...pendentesFiltrados];
    copia.sort((a, b) => {
      const va = valorOrdenacao(a);
      const vb = valorOrdenacao(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [pendentesFiltrados, sortField, sortDir]);

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
          {/* Cabeçalho de colunas (pedido do Felipe, 06/08/2026, em várias
              rodadas): Lanc./Venc./Valor ordenáveis por clique; Descrição é
              filtro de texto; Conta/Categoria/Centro de Custo são filtro por
              checkbox de valor distinto (ColunaFiltro). Mesmo GRID_COLUNAS
              dos cards, pra ficar tudo alinhado; o espaçador de 20px no
              início corresponde ao checkbox (w-4 + gap-2) de cada card. */}
          <div className="flex items-center gap-2 px-3 text-[11px] text-gray-400 font-medium select-none">
            <div className="w-4 flex-shrink-0" />
            <div className={`flex-1 min-w-0 grid ${GRID_COLUNAS} gap-x-3 items-center`}>
              {(
                [
                  ["lancamento", "Lanc."],
                  ["vencimento", "Venc."],
                ] as [SortField, string][]
              ).map(([campo, rotulo]) => (
                <button key={campo} type="button" onClick={() => alternarSort(campo)} className="flex items-center gap-0.5 hover:text-gray-600">
                  {rotulo}
                  {sortField === campo && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                </button>
              ))}

              <ColunaFiltro
                rotulo="Conta"
                opcoes={opcoesConta}
                selecionados={filtroContas}
                aberto={contaPopoverAberto}
                onToggleAberto={() => setContaPopoverAberto((v) => !v)}
                onFechar={() => setContaPopoverAberto(false)}
                onAlternar={(v) => alternarNoFiltro(filtroContas, setFiltroContas, v)}
                onLimpar={() => setFiltroContas(new Set())}
              />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDescPopoverAberto((v) => !v)}
                  className={`flex items-center gap-1 hover:text-gray-600 ${filtroDescricao ? "text-blue-700" : ""}`}
                >
                  Descrição
                  {filtroDescricao && <Search className="w-3 h-3" />}
                </button>
                {descPopoverAberto && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDescPopoverAberto(false);
                      }}
                    />
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-56 normal-case font-normal" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        className="input text-xs py-1.5"
                        placeholder="Buscar descrição..."
                        value={filtroDescricao}
                        onChange={(e) => setFiltroDescricao(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <ColunaFiltro
                rotulo="Categoria"
                opcoes={opcoesCategoria}
                selecionados={filtroCategoriasCol}
                aberto={categoriaPopoverAberto}
                onToggleAberto={() => setCategoriaPopoverAberto((v) => !v)}
                onFechar={() => setCategoriaPopoverAberto(false)}
                onAlternar={(v) => alternarNoFiltro(filtroCategoriasCol, setFiltroCategoriasCol, v)}
                onLimpar={() => setFiltroCategoriasCol(new Set())}
              />
              <ColunaFiltro
                rotulo="Centro de Custo"
                opcoes={opcoesCentroCusto}
                selecionados={filtroCentrosCusto}
                aberto={centroCustoPopoverAberto}
                onToggleAberto={() => setCentroCustoPopoverAberto((v) => !v)}
                onFechar={() => setCentroCustoPopoverAberto(false)}
                onAlternar={(v) => alternarNoFiltro(filtroCentrosCusto, setFiltroCentrosCusto, v)}
                onLimpar={() => setFiltroCentrosCusto(new Set())}
              />

              <button type="button" onClick={() => alternarSort("valor")} className="flex items-center gap-0.5 hover:text-gray-600 justify-end whitespace-nowrap">
                Valor {sortField === "valor" && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
              <span />
            </div>
          </div>

          {pendentesOrdenados.length === 0 && (
            <p className="text-gray-400 text-sm px-3 py-2">Nenhum lançamento encontrado com esse filtro.</p>
          )}

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
