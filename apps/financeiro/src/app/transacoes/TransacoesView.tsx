"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Check, X, Clock, Landmark, ChevronDown, ChevronUp, Pencil, AlertTriangle, Repeat } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorCentroCusto } from "@/components/SeletorCentroCusto";

// Transações Automatizadas — pedido do Felipe, 07/08/2026: pagamentos
// recorrentes a terceiros (vale-transporte, salário, conta de energia...)
// com aprovação em 2 etapas (maker-checker). Fase 1: o sistema NÃO dispara
// o Pix sozinho (Pluggy hoje só está integrado pra leitura) — o Master
// confirma que efetuou o pagamento pelo internet banking dele; o sistema
// só organiza a fila, mostra os dados bancários pré-cadastrados e audita
// quem confirmou o quê. Ver lib/finance/transacoes-automatizadas.ts pro
// fluxo completo (cron gera -> Gerente confirma valor -> Master confirma
// pagamento -> nasce um lançamento previsto normal, casado depois pela
// Conciliação com a transação real).

type Status = "AGUARDANDO_GERENTE" | "AGUARDANDO_MASTER" | "CONFIRMADA" | "REJEITADA";

type Execucao = {
  id: string;
  mesReferencia: string;
  valorSugerido: string;
  valorConfirmado: string | null;
  status: Status;
  confirmadoGerentePorNome: string | null;
  confirmadoGerenteEm: string | null;
  confirmadoMasterPorNome: string | null;
  confirmadoMasterEm: string | null;
  motivoRejeicao: string | null;
  lancamentoId: string | null;
  createdAt: string;
  regra: { id: string; descricao: string; favorecido: string; dadosBancarios: string; categoriaNome: string; contaBancariaId: string | null };
};

type Regra = {
  id: string;
  descricao: string;
  favorecido: string;
  dadosBancarios: string;
  valor: string;
  diaDoMes: number;
  categoriaId: string;
  categoria: { nome: string };
  centroCustoTipo: string;
  propertyId: string | null;
  uhId: string | null;
  contaBancariaId: string | null;
  ativo: boolean;
};

type Categoria = { id: string; nome: string; tipo: string; bloco: string };
type Empreendimento = { id: string; nome: string };
type Unidade = { id: string; nome: string; empreendimentoId: string; empreendimento: string };
type ContaBancaria = { id: string; nome: string; apelido: string | null; tipo: string };
type ContaConectada = { id: string; instituicao: string; contas: ContaBancaria[] };

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function mesLabel(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]}/${String(ano).slice(2)}`;
}

function formatDataHoraBR(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_INFO: Record<Status, { label: string; cor: string }> = {
  AGUARDANDO_GERENTE: { label: "Aguardando Gerente", cor: "text-amber-700 bg-amber-50" },
  AGUARDANDO_MASTER: { label: "Aguardando Master", cor: "text-blue-700 bg-blue-50" },
  CONFIRMADA: { label: "Confirmada", cor: "text-green-700 bg-green-50" },
  REJEITADA: { label: "Rejeitada", cor: "text-red-700 bg-red-50" },
};

const REGRA_VAZIA = {
  descricao: "",
  favorecido: "",
  dadosBancarios: "",
  valor: "",
  diaDoMes: "1",
  categoriaId: "",
  centroCustoTipo: "ADMINISTRACAO" as "ADMINISTRACAO" | "EMPREENDIMENTO" | "UNIDADE",
  empreendimentoId: "",
  unidadeId: "",
  contaBancariaId: "",
};

export function TransacoesView({ role, nome }: { role: string; nome: string }) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [contasConectadas, setContasConectadas] = useState<ContaConectada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [mostrarRegras, setMostrarRegras] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [regraEditandoId, setRegraEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(REGRA_VAZIA);
  const [salvandoRegra, setSalvandoRegra] = useState(false);

  const [valoresEdicao, setValoresEdicao] = useState<Record<string, string>>({});
  const [rejeitandoId, setRejeitandoId] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const podeGerenciarRegras = role === "MASTER";
  const podeConfirmarGerente = role === "GERENTE" || role === "MASTER";
  const podeConfirmarMaster = role === "MASTER";

  async function carregar() {
    setLoading(true);
    const [resE, resR, resC, resEmp, resU, resCt] = await Promise.all([
      apiFetch("/api/transacoes"),
      apiFetch("/api/transacoes-automatizadas"),
      apiFetch("/api/categorias"),
      apiFetch("/api/empreendimentos"),
      apiFetch("/api/unidades"),
      apiFetch("/api/contas"),
    ]);
    if (resE.ok) setExecucoes(await resE.json());
    if (resR.ok) setRegras(await resR.json());
    if (resC.ok) setCategorias(await resC.json());
    if (resEmp.ok) setEmpreendimentos(await resEmp.json());
    if (resU.ok) setUnidades(await resU.json());
    if (resCt.ok) {
      const data = await resCt.json();
      setContasConectadas(data.contasConectadas || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  // nome: apelido ?? nome original — mesmo padrão de Lançamentos/Conciliações.
  const todasContas = useMemo(
    () => contasConectadas.flatMap((cc) => cc.contas.map((c) => ({ ...c, nome: c.apelido || c.nome, instituicao: cc.instituicao }))),
    [contasConectadas]
  );
  const contaPorId = useMemo(() => new Map(todasContas.map((c) => [c.id, c.nome])), [todasContas]);
  const categoriasDespesa = useMemo(() => categorias.filter((c) => c.tipo === "DESPESA"), [categorias]);

  const pendentes = useMemo(
    () => execucoes.filter((e) => e.status === "AGUARDANDO_GERENTE" || e.status === "AGUARDANDO_MASTER").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [execucoes]
  );
  const historico = useMemo(
    () => execucoes.filter((e) => e.status === "CONFIRMADA" || e.status === "REJEITADA").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [execucoes]
  );

  function valorEdicaoDe(execucaoId: string, sugerido: string): string {
    return valoresEdicao[execucaoId] ?? sugerido;
  }

  async function confirmarGerente(execucaoId: string) {
    const valor = Number(valorEdicaoDe(execucaoId, "0").replace(",", "."));
    if (!valor || valor <= 0) {
      setErro("Informe um valor válido antes de confirmar.");
      return;
    }
    setErro("");
    setProcessandoId(execucaoId);
    const res = await apiFetch("/api/transacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: execucaoId, acao: "confirmar-gerente", valorConfirmado: valor }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao confirmar o valor.");
    } else {
      await carregar();
    }
    setProcessandoId(null);
  }

  async function confirmarMaster(execucaoId: string) {
    setErro("");
    setProcessandoId(execucaoId);
    const res = await apiFetch("/api/transacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: execucaoId, acao: "confirmar-master" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao confirmar o pagamento.");
    } else {
      await carregar();
    }
    setProcessandoId(null);
  }

  async function rejeitar(execucaoId: string) {
    setErro("");
    setProcessandoId(execucaoId);
    const res = await apiFetch("/api/transacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: execucaoId, acao: "rejeitar", motivo: motivoRejeicao }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao rejeitar.");
    } else {
      setRejeitandoId(null);
      setMotivoRejeicao("");
      await carregar();
    }
    setProcessandoId(null);
  }

  function abrirNovaRegra() {
    setForm(REGRA_VAZIA);
    setRegraEditandoId(null);
    setFormAberto(true);
  }

  function abrirEdicaoRegra(r: Regra) {
    setForm({
      descricao: r.descricao,
      favorecido: r.favorecido,
      dadosBancarios: r.dadosBancarios,
      valor: r.valor,
      diaDoMes: String(r.diaDoMes),
      categoriaId: r.categoriaId,
      centroCustoTipo: r.centroCustoTipo as "ADMINISTRACAO" | "EMPREENDIMENTO" | "UNIDADE",
      empreendimentoId: r.propertyId || "",
      unidadeId: r.uhId || "",
      contaBancariaId: r.contaBancariaId || "",
    });
    setRegraEditandoId(r.id);
    setFormAberto(true);
  }

  async function salvarRegra() {
    setErro("");
    setSalvandoRegra(true);
    const corpo = {
      descricao: form.descricao,
      favorecido: form.favorecido,
      dadosBancarios: form.dadosBancarios,
      valor: Number(form.valor),
      diaDoMes: Number(form.diaDoMes),
      categoriaId: form.categoriaId,
      centroCustoTipo: form.centroCustoTipo,
      propertyId: form.centroCustoTipo === "EMPREENDIMENTO" ? form.empreendimentoId || null : null,
      uhId: form.centroCustoTipo === "UNIDADE" ? form.unidadeId || null : null,
      contaBancariaId: form.contaBancariaId || null,
    };
    const res = regraEditandoId
      ? await apiFetch("/api/transacoes-automatizadas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: regraEditandoId, ...corpo }) })
      : await apiFetch("/api/transacoes-automatizadas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao salvar a regra.");
    } else {
      setFormAberto(false);
      await carregar();
    }
    setSalvandoRegra(false);
  }

  async function alternarAtivo(r: Regra) {
    await apiFetch("/api/transacoes-automatizadas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, ativo: !r.ativo }),
    });
    await carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Transações</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pagamentos recorrentes a terceiros — o sistema gera a pendência sozinho no dia configurado, o Gerente confirma o valor e o Master confirma
            que efetuou o pagamento pelo internet banking.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Logado como {nome} ({role.toLowerCase()})
            {!podeConfirmarGerente && !podeConfirmarMaster && " — seu perfil só visualiza esta tela, sem ações de confirmação."}
          </p>
        </div>
        {podeGerenciarRegras && (
          <button onClick={abrirNovaRegra} className="btn-primary flex items-center gap-1.5 text-sm flex-shrink-0">
            <Plus className="w-4 h-4" /> Nova transação automatizada
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <>
          {/* Fila de aprovação */}
          {pendentes.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma transação pendente no momento.</p>
          ) : (
            <div className="space-y-2">
              {pendentes.map((e) => {
                const status = STATUS_INFO[e.status];
                const podeAgir = (e.status === "AGUARDANDO_GERENTE" && podeConfirmarGerente) || (e.status === "AGUARDANDO_MASTER" && podeConfirmarMaster);
                return (
                  <div key={e.id} className="card space-y-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{e.regra.descricao}</p>
                        <p className="text-xs text-gray-400">
                          {e.regra.favorecido} · {e.regra.categoriaNome} · {mesLabel(e.mesReferencia)}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 flex items-center gap-1 ${status.cor}`}>
                        <Clock className="w-3 h-3" /> {status.label}
                      </span>
                    </div>

                    {e.status === "AGUARDANDO_GERENTE" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">Valor sugerido: {formatBRL(e.valorSugerido)}</span>
                        {podeConfirmarGerente && (
                          <>
                            <input
                              type="number"
                              step="0.01"
                              className="input text-sm py-1.5 w-32"
                              value={valorEdicaoDe(e.id, e.valorSugerido)}
                              onChange={(ev) => setValoresEdicao((v) => ({ ...v, [e.id]: ev.target.value }))}
                            />
                            <button
                              onClick={() => confirmarGerente(e.id)}
                              disabled={processandoId === e.id}
                              className="btn-primary flex items-center gap-1.5 text-sm py-1.5"
                            >
                              <Check className="w-4 h-4" /> Confirmar valor
                            </button>
                            <button
                              onClick={() => setRejeitandoId(e.id)}
                              disabled={processandoId === e.id}
                              className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5"
                            >
                              <X className="w-4 h-4" /> Rejeitar
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {e.status === "AGUARDANDO_MASTER" && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-700">
                          Valor confirmado: <span className="font-semibold">{formatBRL(e.valorConfirmado ?? e.valorSugerido)}</span>
                          {e.confirmadoGerentePorNome && <span className="text-xs text-gray-400"> — por {e.confirmadoGerentePorNome} em {formatDataHoraBR(e.confirmadoGerenteEm)}</span>}
                        </p>
                        {podeConfirmarMaster && (
                          <>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
                              <p className="flex items-center gap-1.5 text-gray-700 font-medium">
                                <Landmark className="w-3.5 h-3.5 flex-shrink-0" /> {e.regra.favorecido}
                              </p>
                              <p className="text-gray-500 whitespace-pre-wrap">{e.regra.dadosBancarios}</p>
                              {e.regra.contaBancariaId && <p className="text-xs text-gray-400">Saída de: {contaPorId.get(e.regra.contaBancariaId) ?? "—"}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => confirmarMaster(e.id)}
                                disabled={processandoId === e.id}
                                className="btn-primary flex items-center gap-1.5 text-sm py-1.5"
                              >
                                <Check className="w-4 h-4" /> Confirmei o pagamento
                              </button>
                              <button
                                onClick={() => setRejeitandoId(e.id)}
                                disabled={processandoId === e.id}
                                className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5"
                              >
                                <X className="w-4 h-4" /> Rejeitar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {!podeAgir && (
                      <p className="text-xs text-gray-400">
                        {e.status === "AGUARDANDO_GERENTE" ? "Aguardando confirmação do Gerente." : "Aguardando confirmação do Master."}
                      </p>
                    )}

                    {rejeitandoId === e.id && (
                      <div className="border-t border-gray-100 pt-2 space-y-2">
                        <input
                          className="input text-sm"
                          placeholder="Motivo da rejeição (opcional)"
                          value={motivoRejeicao}
                          onChange={(ev) => setMotivoRejeicao(ev.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={() => rejeitar(e.id)} disabled={processandoId === e.id} className="text-sm bg-red-600 text-white rounded-lg px-3 py-1.5">
                            Confirmar rejeição
                          </button>
                          <button
                            onClick={() => {
                              setRejeitandoId(null);
                              setMotivoRejeicao("");
                            }}
                            className="text-sm text-gray-500 px-3 py-1.5"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Histórico */}
          <div className="pt-2">
            <button onClick={() => setMostrarHistorico((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
              {mostrarHistorico ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} Histórico ({historico.length})
            </button>
            {mostrarHistorico && (
              <div className="space-y-1.5 mt-2">
                {historico.length === 0 ? (
                  <p className="text-gray-400 text-sm">Nenhuma transação confirmada ou rejeitada ainda.</p>
                ) : (
                  historico.map((e) => {
                    const status = STATUS_INFO[e.status];
                    return (
                      <div key={e.id} className="flex items-center justify-between text-sm border-b border-gray-50 py-2 gap-2 flex-wrap">
                        <div className="min-w-0">
                          <span className="text-gray-700">{e.regra.descricao}</span>
                          <span className="text-gray-400"> · {mesLabel(e.mesReferencia)}</span>
                          {e.status === "CONFIRMADA" && e.confirmadoMasterPorNome && (
                            <span className="text-xs text-gray-400"> — confirmado por {e.confirmadoMasterPorNome} em {formatDataHoraBR(e.confirmadoMasterEm)}</span>
                          )}
                          {e.status === "REJEITADA" && e.motivoRejeicao && <span className="text-xs text-gray-400"> — {e.motivoRejeicao}</span>}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${status.cor}`}>
                          {e.status === "CONFIRMADA" ? formatBRL(e.valorConfirmado ?? "0") + " · " : ""}
                          {status.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Regras cadastradas */}
          <div className="pt-2">
            <button onClick={() => setMostrarRegras((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
              {mostrarRegras ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} Transações automatizadas cadastradas ({regras.length})
            </button>
            {mostrarRegras && (
              <div className="space-y-1.5 mt-2">
                {regras.length === 0 ? (
                  <p className="text-gray-400 text-sm">Nenhuma transação automatizada cadastrada ainda.</p>
                ) : (
                  regras.map((r) => (
                    <div key={r.id} className={`flex items-center justify-between text-sm border-b border-gray-50 py-2 gap-2 flex-wrap ${!r.ativo ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex items-center gap-1.5">
                        <Repeat className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <div>
                          <span className="text-gray-700">{r.descricao}</span>
                          <span className="text-gray-400"> — {formatBRL(r.valor)} todo dia {r.diaDoMes} · {r.categoria.nome}</span>
                        </div>
                      </div>
                      {podeGerenciarRegras && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => abrirEdicaoRegra(r)} className="text-gray-400 hover:text-gray-700" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => alternarAtivo(r)} className="text-xs text-gray-500 hover:text-gray-800 underline">
                            {r.ativo ? "Desativar" : "Reativar"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}

      {formAberto && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{regraEditandoId ? "Editar transação automatizada" : "Nova transação automatizada"}</h2>
              <button onClick={() => setFormAberto(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Fase 1: o sistema não envia o Pix sozinho. Ele gera a pendência no dia configurado, o Gerente confirma o valor e você (Master) confirma
              depois de pagar pelo internet banking.
            </p>

            <div>
              <label className="label">Descrição</label>
              <input className="input" placeholder="Ex.: Vale-transporte — Jurandir Roberto de Farias" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div>
              <label className="label">Favorecido</label>
              <input className="input" placeholder="Nome de quem recebe" value={form.favorecido} onChange={(e) => setForm((f) => ({ ...f, favorecido: e.target.value }))} />
            </div>
            <div>
              <label className="label">Dados bancários (chave Pix ou banco/agência/conta)</label>
              <textarea className="input" rows={2} value={form.dadosBancarios} onChange={(e) => setForm((f) => ({ ...f, dadosBancarios: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Valor</label>
                <input className="input" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              </div>
              <div>
                <label className="label">Dia do mês</label>
                <select className="input" value={form.diaDoMes} onChange={(e) => setForm((f) => ({ ...f, diaDoMes: e.target.value }))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Dia {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={form.categoriaId} onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value }))}>
                <option value="">Selecione...</option>
                {categoriasDespesa.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Conta de origem (opcional, só informativo)</label>
              <select className="input" value={form.contaBancariaId} onChange={(e) => setForm((f) => ({ ...f, contaBancariaId: e.target.value }))}>
                <option value="">Não informar</option>
                {todasContas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — {c.instituicao}
                  </option>
                ))}
              </select>
            </div>

            <SeletorCentroCusto
              tipo={form.centroCustoTipo}
              empreendimentoId={form.empreendimentoId || null}
              unidadeId={form.unidadeId || null}
              empreendimentos={empreendimentos}
              unidades={unidades}
              onChange={(v) => setForm((f) => ({ ...f, centroCustoTipo: v.centroCustoTipo, empreendimentoId: v.empreendimentoId || "", unidadeId: v.unidadeId || "" }))}
            />

            <button onClick={salvarRegra} disabled={salvandoRegra} className="btn-primary w-full">
              {salvandoRegra ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
