"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X, Trash2, Repeat, Layers, ListChecks, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { CategorizacaoEmLoteView } from "./CategorizacaoEmLoteView";

// Extrato bancário (pedido do Felipe, 05/08/2026): a tela de Lançamentos
// deve se parecer com o extrato de um banco de verdade — cronológico,
// filtrado por conta, com saldo corrente. Sem conta selecionada, cai de
// volta pro modo "lista geral" (mais recentes primeiro, sem saldo — não dá
// pra somar saldo de contas diferentes).

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

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
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

  const todasContas = useMemo(() => contasConectadas.flatMap((cc) => cc.contas.map((c) => ({ ...c, instituicao: cc.instituicao }))), [contasConectadas]);
  const contaAtual = todasContas.find((c) => c.id === contaSelecionada) || null;

  async function carregar() {
    setLoading(true);
    const params = new URLSearchParams();
    if (somentePendentes) params.set("pendentes", "1");
    if (contaSelecionada) params.set("contaBancariaId", contaSelecionada);
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
  }, [somentePendentes, contaSelecionada]);

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

      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <select className="input text-sm py-1.5 max-w-xs" value={contaSelecionada} onChange={(e) => setContaSelecionada(e.target.value)}>
          <option value="">Todas as contas (visão geral)</option>
          {todasContas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} — {c.instituicao}
            </option>
          ))}
        </select>
        {contaAtual && contaAtual.saldoAtual != null && (
          <span className="text-xs text-gray-400">saldo atual: {formatBRL(contaAtual.saldoAtual)}</span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : lancamentos.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum lançamento encontrado.</p>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="font-medium px-3 py-2">Data</th>
                <th className="font-medium px-3 py-2 w-64">Descrição</th>
                <th className="font-medium px-3 py-2 w-40">Categoria</th>
                <th className="font-medium px-3 py-2">Status</th>
                <th className="font-medium px-3 py-2 text-right">Valor</th>
                <th className="font-medium px-3 py-2 text-right">Saldo</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => {
                const valorNum = Number(l.valor);
                const status = STATUS_INFO[l.status];
                return (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/70 last:border-0">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap cursor-pointer" onClick={() => setEditando(l)}>
                      {formatDataBR(l.dataVencimento)}
                    </td>
                    <td className="px-3 py-2 cursor-pointer max-w-0" onClick={() => setEditando(l)} title={l.descricao}>
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
                    <td className="px-3 py-2">
                      {!l.categoriaId ? (
                        <select
                          onChange={(e) => e.target.value && categorizar(l.id, e.target.value)}
                          defaultValue=""
                          className="text-xs border border-amber-300 bg-amber-50 rounded px-2 py-1 w-40"
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
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 w-40"
                        >
                          {categorias.filter((c) => c.tipo === (valorNum >= 0 ? "RECEITA" : "DESPESA")).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${status.cls}`}>{status.rotulo}</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${valorNum >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(l.valor)}</td>
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{l.saldo != null ? formatBRL(l.saldo) : "—"}</td>
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
