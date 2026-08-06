"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X, Trash2, Repeat, Layers, ListChecks, Wallet, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Search } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { CategorizacaoEmLoteView } from "./CategorizacaoEmLoteView";

// Extrato bancário (pedido do Felipe, 05/08/2026): a tela de Lançamentos
// deve se parecer com o extrato de um banco de verdade — cronológico,
// filtrado por conta, com saldo corrente. Sem conta selecionada, cai de
// volta pro modo "lista geral" (sem saldo — não dá pra somar saldo de
// contas diferentes).
//
// Filtros de período (pedido de 05/08/2026, 2ª e 3ª rodadas): duas abas
// explícitas — "Mensal" (setas prev/next + popover ano/mês) e "Período
// específico" (Ano via lista suspensa / Dia via calendário, default hoje /
// range customizado). A aba ativa manda no fetch.

type Categoria = { id: string; nome: string; tipo: string; bloco: string };
type ContaBancaria = { id: string; nome: string; tipo: "BANK" | "CREDIT"; saldoAtual: string | null };
type ContaConectada = { id: string; instituicao: string; contas: ContaBancaria[] };

type StatusLancamento = "VENCIDO" | "A_VENCER" | "QUITADO";

type Lancamento = {
  id: string;
  categoriaId: string | null;
  categoria: { nome: string; bloco: string; tipo: string } | null;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataVencimento: string;
  dataCompetencia: string | null;
  contaBancariaId: string | null;
  contaBancaria: { id: string; nome: string; tipo: "BANK" | "CREDIT" } | null;
  pago: boolean;
  status: StatusLancamento;
  saldo: number | null;
  parcelaGrupoId: string | null;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
  recorrente: boolean;
  recorrenciaFimData: string | null;
  origem: string;
  centroCusto: string | null;
  observacoes: string | null;
};

const STATUS_INFO: Record<StatusLancamento, { rotulo: string; cls: string }> = {
  QUITADO: { rotulo: "Quitado", cls: "bg-green-50 text-green-700" },
  A_VENCER: { rotulo: "A Vencer", cls: "bg-amber-50 text-amber-700" },
  VENCIDO: { rotulo: "Vencido", cls: "bg-red-50 text-red-700" },
};

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function mesLabel(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]}/${String(ano).slice(2)}`;
}

function mesAdjacenteLocal(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function limitesDoMesLocal(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, "0")}` };
}

const hojeISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const emptyForm = {
  descricao: "",
  fornecedor: "",
  categoriaId: "",
  tipo: "DESPESA" as "RECEITA" | "DESPESA",
  valor: "",
  dataVencimento: hojeISO,
  dataCompetencia: "",
  modo: "normal" as "normal" | "parcelado" | "recorrente",
  parcelas: "2",
  recorrenciaFimData: "",
  centroCusto: "",
  observacoes: "",
};

type PeriodoModo = "mensal" | "especifico";
type PeriodoEspecificoTipo = "ano" | "dia" | "range";
type SortField = "data" | "valor";

export function LancamentosView() {
  const searchParams = useSearchParams();
  const somentePendentes = searchParams.get("pendentes") === "1";

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contasConectadas, setContasConectadas] = useState<ContaConectada[]>([]);
  const [contaSelecionada, setContaSelecionada] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [modoLote, setModoLote] = useState(false);
  const [editando, setEditando] = useState<Lancamento | null>(null);

  // Período — o usuário escolhe explicitamente o modo (Mensal ou Período
  // específico) numa aba; dentro de "específico" escolhe entre Ano, Dia
  // (default hoje, mas qualquer dia via calendário) ou um range
  // customizado. Sem popovers pra essa segunda parte (só pro seletor de
  // mês, que precisa da grade de 12 meses) — evita os bugs de
  // popover-dentro-de-th que apareceram antes.
  const [periodoModo, setPeriodoModo] = useState<PeriodoModo>("mensal");
  const [periodoEspecificoTipo, setPeriodoEspecificoTipo] = useState<PeriodoEspecificoTipo>("ano");
  const [mes, setMes] = useState(hojeISO.slice(0, 7));
  const [ano, setAno] = useState(String(Number(hojeISO.slice(0, 4))));
  const [diaEspecifico, setDiaEspecifico] = useState(hojeISO);
  const [rangeInicio, setRangeInicio] = useState(hojeISO);
  const [rangeFim, setRangeFim] = useState(hojeISO);
  const [mesPopoverAberto, setMesPopoverAberto] = useState(false);
  const [anoPopoverNav, setAnoPopoverNav] = useState(Number(mes.slice(0, 4)));

  const anosDisponiveis = useMemo(() => {
    const atual = Number(hojeISO.slice(0, 4));
    const anos: number[] = [];
    for (let a = atual + 5; a >= atual - 15; a--) anos.push(a);
    return anos;
  }, []);

  // Ordenação + filtros de coluna
  const [sortField, setSortField] = useState<SortField>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [filtroCategorias, setFiltroCategorias] = useState<Set<string>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<Set<StatusLancamento>>(new Set());
  const [descPopoverAberto, setDescPopoverAberto] = useState(false);
  const [catPopoverAberto, setCatPopoverAberto] = useState(false);
  const [statusPopoverAberto, setStatusPopoverAberto] = useState(false);

  const todasContas = useMemo(() => contasConectadas.flatMap((cc) => cc.contas.map((c) => ({ ...c, instituicao: cc.instituicao }))), [contasConectadas]);
  const contaAtual = todasContas.find((c) => c.id === contaSelecionada) || null;

  // Cartão de crédito não tem "saldo atual" que faça sentido (não é conta
  // corrente) — mostra o total do período em vez disso: valor da fatura
  // inteira quando o filtro é Mensal, ou soma do range quando é período
  // específico (pedido do Felipe, 05/08/2026, 3ª rodada).
  const somaPeriodo = useMemo(() => lancamentos.reduce((acc, l) => acc + Number(l.valor), 0), [lancamentos]);

  function periodoAtual(): { inicio: string; fim: string } {
    if (periodoModo === "mensal") return limitesDoMesLocal(mes);
    if (periodoEspecificoTipo === "ano") return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
    if (periodoEspecificoTipo === "dia") return { inicio: diaEspecifico, fim: diaEspecifico };
    return { inicio: rangeInicio, fim: rangeFim };
  }

  async function carregar() {
    setLoading(true);
    const { inicio, fim } = periodoAtual();
    const params = new URLSearchParams();
    if (somentePendentes) params.set("pendentes", "1");
    if (contaSelecionada) params.set("contaBancariaId", contaSelecionada);
    params.set("dataInicio", inicio);
    params.set("dataFim", fim);
    const [resL, resC, resCt] = await Promise.all([
      apiFetch(`/api/lancamentos?${params.toString()}`),
      apiFetch("/api/categorias"),
      apiFetch("/api/contas"),
    ]);
    if (resL.ok) setLancamentos(await resL.json());
    if (resC.ok) setCategorias(await resC.json());
    if (resCt.ok) setContasConectadas((await resCt.json()).contasConectadas || []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [somentePendentes, contaSelecionada, periodoModo, periodoEspecificoTipo, mes, ano, diaEspecifico, rangeInicio, rangeFim]);

  function abrirNovo() {
    setForm({ ...emptyForm, dataVencimento: hojeISO });
    setErro("");
    setShowForm(true);
  }

  async function categorizar(id: string, categoriaId: string) {
    await apiFetch("/api/lancamentos", { method: "PATCH", body: JSON.stringify({ id, categoriaId }), headers: { "Content-Type": "application/json" } });
    carregar();
  }

  async function excluir(l: Lancamento) {
    const ehGrupo = l.parcelaGrupoId && l.parcelaTotal && l.parcelaTotal > 1;
    const grupoInteiro = ehGrupo ? confirm(`Apagar TODAS as ${l.parcelaTotal} parcelas dessa compra? Cancelar apaga só esta.`) : false;
    if (!confirm(grupoInteiro ? "Apagar todas as parcelas?" : "Apagar este lançamento?")) return;
    await apiFetch(`/api/lancamentos?id=${l.id}${grupoInteiro ? "&grupo=1" : ""}`, { method: "DELETE" });
    carregar();
  }

  async function salvar() {
    if (!form.descricao.trim() || !form.valor) {
      setErro("Descrição e valor são obrigatórios.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await apiFetch("/api/lancamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: form.descricao,
          fornecedor: form.fornecedor || undefined,
          categoriaId: form.categoriaId || null,
          tipo: form.tipo,
          valor: Number(form.valor),
          dataVencimento: form.dataVencimento,
          dataCompetencia: form.dataCompetencia || undefined,
          contaBancariaId: contaSelecionada || undefined,
          parcelas: form.modo === "parcelado" ? Number(form.parcelas) : undefined,
          recorrente: form.modo === "recorrente",
          recorrenciaFimData: form.modo === "recorrente" ? form.recorrenciaFimData || null : undefined,
          centroCusto: form.centroCusto || undefined,
          observacoes: form.observacoes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.error || "Erro ao salvar.");
        return;
      }
      setShowForm(false);
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao() {
    if (!editando) return;
    setSalvando(true);
    try {
      await apiFetch("/api/lancamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editando.id,
          categoriaId: editando.categoriaId,
          dataVencimento: editando.dataVencimento,
          dataCompetencia: editando.dataCompetencia || null,
          recorrente: editando.recorrente,
          pago: editando.pago,
        }),
      });
      setEditando(null);
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  function alternarSort(campo: SortField) {
    if (sortField === campo) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(campo);
      setSortDir("desc");
    }
  }

  function toggleCategoriaFiltro(id: string) {
    setFiltroCategorias((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleStatusFiltro(s: StatusLancamento) {
    setFiltroStatus((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  const listaFiltrada = useMemo(() => {
    let arr = lancamentos;
    if (filtroDescricao.trim()) {
      const q = filtroDescricao.trim().toLowerCase();
      arr = arr.filter((l) => l.descricao.toLowerCase().includes(q) || (l.fornecedor || "").toLowerCase().includes(q));
    }
    if (filtroCategorias.size > 0) arr = arr.filter((l) => l.categoriaId && filtroCategorias.has(l.categoriaId));
    if (filtroStatus.size > 0) arr = arr.filter((l) => filtroStatus.has(l.status));

    return [...arr].sort((a, b) => {
      // Ordena pela mesma data que a coluna mostra (Competência, com
      // fallback pra Vencimento) — senão a ordem visual fica embaralhada
      // quando várias linhas compartilham o mesmo Vencimento (ex.: todas as
      // compras de uma fatura de cartão). O filtro de período/mês continua
      // por Vencimento, só a ordenação da lista já filtrada muda aqui.
      const cmp =
        sortField === "data"
          ? (a.dataCompetencia || a.dataVencimento).localeCompare(b.dataCompetencia || b.dataVencimento)
          : Number(a.valor) - Number(b.valor);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [lancamentos, filtroDescricao, filtroCategorias, filtroStatus, sortField, sortDir]);

  const categoriasFiltradas = categorias.filter((c) => c.tipo === form.tipo);

  if (modoLote) {
    return <CategorizacaoEmLoteView onVoltar={() => { setModoLote(false); carregar(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-gray-900">
          Lançamentos {somentePendentes && <span className="text-amber-600 font-medium text-sm">— sem categoria</span>}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setModoLote(true)} className="flex items-center gap-1.5 text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50">
            <ListChecks className="w-4 h-4" /> Categorizar em lote
          </button>
          <button onClick={abrirNovo} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" /> Novo
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Wallet className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <select className="input text-sm py-1.5 max-w-xs" value={contaSelecionada} onChange={(e) => setContaSelecionada(e.target.value)}>
          <option value="">Todas as contas (visão geral)</option>
          {todasContas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} — {c.instituicao}
            </option>
          ))}
        </select>
        {contaAtual && contaAtual.tipo === "CREDIT" && (
          <span className="text-xs text-gray-400 mr-1">
            {periodoModo === "mensal" ? "saldo da fatura" : "somatório do período"}: {formatBRL(somaPeriodo)}
          </span>
        )}
        {contaAtual && contaAtual.tipo !== "CREDIT" && contaAtual.saldoAtual != null && (
          <span className="text-xs text-gray-400 mr-1">saldo atual: {formatBRL(contaAtual.saldoAtual)}</span>
        )}

        {/* Escolha explícita do tipo de período — Mensal ou Período específico */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setPeriodoModo("mensal")}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-md ${periodoModo === "mensal" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Mensal
          </button>
          <button
            onClick={() => setPeriodoModo("especifico")}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-md ${periodoModo === "especifico" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Período específico
          </button>
        </div>

        {periodoModo === "mensal" ? (
          <div className="relative flex items-center gap-0.5 border border-gray-300 rounded-lg px-1 py-1">
            <button onClick={() => setMes((m) => mesAdjacenteLocal(m, -1))} className="text-gray-400 hover:text-gray-900 p-1">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setAnoPopoverNav(Number(mes.slice(0, 4)));
                setMesPopoverAberto((v) => !v);
              }}
              className="text-sm font-medium text-gray-700 px-1 min-w-[84px] text-center"
            >
              {mesLabel(mes)}
            </button>
            <button onClick={() => setMes((m) => mesAdjacenteLocal(m, 1))} className="text-gray-400 hover:text-gray-900 p-1">
              <ChevronRight className="w-4 h-4" />
            </button>

            {mesPopoverAberto && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMesPopoverAberto(false);
                  }}
                />
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setAnoPopoverNav((a) => a - 1)} className="text-gray-400 hover:text-gray-900">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-gray-900">{anoPopoverNav}</span>
                    <button onClick={() => setAnoPopoverNav((a) => a + 1)} className="text-gray-400 hover:text-gray-900">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {NOMES_MES.map((nome, i) => {
                      const valor = `${anoPopoverNav}-${String(i + 1).padStart(2, "0")}`;
                      const ativo = valor === mes;
                      return (
                        <button
                          key={nome}
                          onClick={() => {
                            setMes(valor);
                            setMesPopoverAberto(false);
                          }}
                          className={`text-xs py-1.5 rounded ${ativo ? "bg-gray-900 text-white" : "hover:bg-gray-100 text-gray-600"}`}
                        >
                          {nome.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-2 py-1">
            <div className="flex gap-1">
              {(
                [
                  ["ano", "Ano"],
                  ["dia", "Dia"],
                  ["range", "Período"],
                ] as const
              ).map(([tipo, rotulo]) => (
                <button
                  key={tipo}
                  onClick={() => setPeriodoEspecificoTipo(tipo)}
                  className={`text-xs py-1 px-2 rounded ${periodoEspecificoTipo === tipo ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {periodoEspecificoTipo === "ano" && (
              <select className="input text-xs py-1 w-24" value={ano} onChange={(e) => setAno(e.target.value)}>
                {anosDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}

            {periodoEspecificoTipo === "range" && (
              <div className="flex items-center gap-1.5">
                <input type="date" className="input text-xs py-1" value={rangeInicio} onChange={(e) => setRangeInicio(e.target.value)} />
                <span className="text-gray-400 text-xs">até</span>
                <input type="date" className="input text-xs py-1" value={rangeFim} onChange={(e) => setRangeFim(e.target.value)} />
              </div>
            )}

            {periodoEspecificoTipo === "dia" && <input type="date" className="input text-xs py-1" value={diaEspecifico} onChange={(e) => setDiaEspecifico(e.target.value)} />}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : listaFiltrada.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum lançamento encontrado.</p>
      ) : (
        <div className="card !p-0 overflow-auto max-h-[calc(100vh-260px)]">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th
                  className="sticky top-0 z-10 bg-white border-b border-gray-100 font-medium pl-3 pr-4 py-2 w-[104px] cursor-pointer select-none whitespace-nowrap"
                  onClick={() => alternarSort("data")}
                  title="Exibe e ordena pela Data de Competência (o filtro de período/mês continua pela Data de Vencimento)"
                >
                  <span className="inline-flex items-center gap-0.5">
                    Data {sortField === "data" && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </span>
                </th>
                <th
                  className="sticky top-0 z-10 bg-white border-b border-gray-100 relative font-medium pl-3 pr-2 py-2 cursor-pointer select-none"
                  onClick={() => setDescPopoverAberto((v) => !v)}
                >
                  <span className={filtroDescricao ? "text-blue-700" : ""}>Descrição</span>
                  {filtroDescricao && <Search className="inline w-3 h-3 ml-1 text-blue-600" />}
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
                          placeholder="Buscar descrição/fornecedor..."
                          value={filtroDescricao}
                          onChange={(e) => setFiltroDescricao(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </th>
                <th
                  className="sticky top-0 z-10 bg-white border-b border-gray-100 relative font-medium px-2 py-2 w-40 cursor-pointer select-none"
                  onClick={() => setCatPopoverAberto((v) => !v)}
                >
                  <span className={filtroCategorias.size > 0 ? "text-blue-700" : ""}>Categoria{filtroCategorias.size > 0 ? ` (${filtroCategorias.size})` : ""}</span>
                  {catPopoverAberto && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCatPopoverAberto(false);
                        }}
                      />
                      <div
                        className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-56 max-h-72 overflow-y-auto normal-case font-normal"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {filtroCategorias.size > 0 && (
                          <button onClick={() => setFiltroCategorias(new Set())} className="text-xs text-blue-600 hover:underline mb-1">
                            Limpar filtro
                          </button>
                        )}
                        {categorias.map((c) => (
                          <label key={c.id} className="flex items-center gap-1.5 text-xs py-1 cursor-pointer hover:bg-gray-50 px-1 rounded">
                            <input type="checkbox" checked={filtroCategorias.has(c.id)} onChange={() => toggleCategoriaFiltro(c.id)} />
                            {c.nome}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </th>
                <th
                  className="sticky top-0 z-10 bg-white border-b border-gray-100 relative font-medium px-2 py-2 w-[92px] cursor-pointer select-none"
                  onClick={() => setStatusPopoverAberto((v) => !v)}
                >
                  <span className={filtroStatus.size > 0 ? "text-blue-700" : ""}>Status</span>
                  {statusPopoverAberto && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusPopoverAberto(false);
                        }}
                      />
                      <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-36 normal-case font-normal" onClick={(e) => e.stopPropagation()}>
                        {filtroStatus.size > 0 && (
                          <button onClick={() => setFiltroStatus(new Set())} className="text-xs text-blue-600 hover:underline mb-1">
                            Limpar filtro
                          </button>
                        )}
                        {(["VENCIDO", "A_VENCER", "QUITADO"] as const).map((s) => (
                          <label key={s} className="flex items-center gap-1.5 text-xs py-1 cursor-pointer hover:bg-gray-50 px-1 rounded">
                            <input type="checkbox" checked={filtroStatus.has(s)} onChange={() => toggleStatusFiltro(s)} />
                            {STATUS_INFO[s].rotulo}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </th>
                <th
                  className="sticky top-0 z-10 bg-white border-b border-gray-100 font-medium px-2 py-2 w-28 text-right cursor-pointer select-none whitespace-nowrap"
                  onClick={() => alternarSort("valor")}
                >
                  <span className="inline-flex items-center gap-0.5">
                    Valor {sortField === "valor" && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </span>
                </th>
                <th className="sticky top-0 z-10 bg-white border-b border-gray-100 font-medium px-2 py-2 w-28 text-right">Saldo</th>
                <th className="sticky top-0 z-10 bg-white border-b border-gray-100 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((l) => {
                const valorNum = Number(l.valor);
                const status = STATUS_INFO[l.status];
                return (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/70 last:border-0">
                    <td
                      className="pl-3 pr-4 py-2 text-gray-500 whitespace-nowrap cursor-pointer"
                      onClick={() => setEditando(l)}
                      title={`Vencimento: ${formatDataBR(l.dataVencimento)}`}
                    >
                      {formatDataBR(l.dataCompetencia || l.dataVencimento)}
                    </td>
                    <td className="pl-3 pr-2 py-2 cursor-pointer" onClick={() => setEditando(l)} title={l.descricao}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium text-gray-900 truncate">{l.descricao}</span>
                        {l.recorrente && (
                          <span title="Recorrente" className="flex-shrink-0">
                            <Repeat className="w-3 h-3 text-blue-500" />
                          </span>
                        )}
                        {l.parcelaTotal && l.parcelaTotal > 1 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                            <Layers className="w-3 h-3" /> {l.parcelaNumero}/{l.parcelaTotal}
                          </span>
                        )}
                      </div>
                      {l.fornecedor && <p className="text-xs text-gray-400 truncate">{l.fornecedor}</p>}
                    </td>
                    <td className="px-2 py-2">
                      {!l.categoriaId ? (
                        <select
                          onChange={(e) => e.target.value && categorizar(l.id, e.target.value)}
                          defaultValue=""
                          className="text-xs border border-amber-300 bg-amber-50 rounded px-2 py-1 w-full"
                        >
                          <option value="" disabled>
                            Categorizar...
                          </option>
                          {categorias.filter((c) => c.tipo === (valorNum >= 0 ? "RECEITA" : "DESPESA")).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={l.categoriaId}
                          onChange={(e) => e.target.value && categorizar(l.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 w-full"
                        >
                          {categorias.filter((c) => c.tipo === (valorNum >= 0 ? "RECEITA" : "DESPESA")).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${status.cls}`}>{status.rotulo}</span>
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold whitespace-nowrap ${valorNum >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(l.valor)}</td>
                    <td className="px-2 py-2 text-right text-gray-500 whitespace-nowrap">{l.saldo != null ? formatBRL(l.saldo) : "—"}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => excluir(l)} className="text-gray-300 hover:text-red-600" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Novo lançamento</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

            <div className="flex gap-2">
              {(["DESPESA", "RECEITA"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, tipo: t, categoriaId: "" }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    form.tipo === t ? (t === "DESPESA" ? "bg-red-600 text-white border-red-600" : "bg-green-600 text-white border-green-600") : "border-gray-300 text-gray-600"
                  }`}
                >
                  {t === "DESPESA" ? "Despesa" : "Receita"}
                </button>
              ))}
            </div>

            <div>
              <label className="label">Descrição</label>
              <input className="input" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              </div>
              <div>
                <label className="label">Data de vencimento</label>
                <input className="input" type="date" value={form.dataVencimento} onChange={(e) => setForm((f) => ({ ...f, dataVencimento: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="label">Data de competência (opcional)</label>
              <input className="input" type="date" value={form.dataCompetencia} onChange={(e) => setForm((f) => ({ ...f, dataCompetencia: e.target.value }))} />
            </div>

            <div>
              <label className="label">Categoria</label>
              <select className="input" value={form.categoriaId} onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value }))}>
                <option value="">Categorizar depois</option>
                {categoriasFiltradas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Fornecedor (opcional)</label>
              <input className="input" value={form.fornecedor} onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.value }))} />
            </div>

            <div>
              <label className="label">Formato</label>
              <div className="flex gap-2">
                {([
                  ["normal", "Único"],
                  ["parcelado", "Parcelado"],
                  ["recorrente", "Recorrente"],
                ] as const).map(([modo, rotulo]) => (
                  <button
                    key={modo}
                    onClick={() => setForm((f) => ({ ...f, modo }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.modo === modo ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>

            {form.modo === "parcelado" && (
              <div>
                <label className="label">Número de parcelas</label>
                <input className="input" type="number" min="2" value={form.parcelas} onChange={(e) => setForm((f) => ({ ...f, parcelas: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">
                  O valor informado é o TOTAL da compra — será dividido em {form.parcelas || "N"} parcelas, uma por mês a partir da data de vencimento.
                </p>
              </div>
            )}

            {form.modo === "recorrente" && (
              <div>
                <label className="label">Recorrência termina em (opcional)</label>
                <input className="input" type="date" value={form.recorrenciaFimData} onChange={(e) => setForm((f) => ({ ...f, recorrenciaFimData: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Deixe em branco pra recorrência indefinida — aparece em toda DRE a partir da data de vencimento acima.</p>
              </div>
            )}

            <div>
              <label className="label">Centro de custo (opcional)</label>
              <input className="input" value={form.centroCusto} onChange={(e) => setForm((f) => ({ ...f, centroCusto: e.target.value }))} placeholder="ex.: 203 VI" />
            </div>

            <button onClick={salvar} disabled={salvando} className="btn-primary w-full">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Editar lançamento</h2>
              <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-500">{editando.descricao}</p>

            <div>
              <label className="label">Categoria</label>
              <select
                className="input"
                value={editando.categoriaId || ""}
                onChange={(e) => setEditando((ed) => (ed ? { ...ed, categoriaId: e.target.value || null } : ed))}
              >
                <option value="">Sem categoria</option>
                {categorias
                  .filter((c) => c.tipo === (Number(editando.valor) >= 0 ? "RECEITA" : "DESPESA"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data de vencimento{editando.contaBancaria?.tipo === "CREDIT" ? " (fatura)" : ""}</label>
                <input
                  className="input"
                  type="date"
                  value={editando.dataVencimento}
                  onChange={(e) => setEditando((ed) => (ed ? { ...ed, dataVencimento: e.target.value } : ed))}
                />
                {editando.contaBancaria?.tipo === "CREDIT" && (
                  <p className="text-xs text-gray-400 mt-1">Lançamento de cartão — o vencimento é sempre o da fatura, não o da compra.</p>
                )}
              </div>
              <div>
                <label className="label">Data de competência</label>
                <input
                  className="input"
                  type="date"
                  value={editando.dataCompetencia || ""}
                  onChange={(e) => setEditando((ed) => (ed ? { ...ed, dataCompetencia: e.target.value } : ed))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editando.recorrente}
                disabled={Boolean(editando.parcelaGrupoId)}
                onChange={(e) => setEditando((ed) => (ed ? { ...ed, recorrente: e.target.checked } : ed))}
              />
              Recorrente
              {editando.parcelaGrupoId && <span className="text-xs text-gray-400">(parcelado não pode ser recorrente)</span>}
            </label>

            {editando.contaBancaria?.tipo === "CREDIT" ? (
              <p className="text-xs text-gray-400">
                Status é definido automaticamente: vira "Quitado" quando o pagamento da fatura é detectado na conta corrente vinculada.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={editando.pago} onChange={(e) => setEditando((ed) => (ed ? { ...ed, pago: e.target.checked } : ed))} />
                Marcar como pago manualmente
              </label>
            )}

            <button onClick={salvarEdicao} disabled={salvando} className="btn-primary w-full">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
