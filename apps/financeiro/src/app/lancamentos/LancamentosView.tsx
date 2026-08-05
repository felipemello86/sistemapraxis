"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X, Trash2, Repeat, Layers, ListChecks } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { CategorizacaoEmLoteView } from "./CategorizacaoEmLoteView";

type Categoria = { id: string; nome: string; tipo: string; bloco: string };

type Lancamento = {
  id: string;
  categoriaId: string | null;
  categoria: { nome: string; bloco: string; tipo: string } | null;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataVencimento: string;
  parcelaGrupoId: string | null;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
  recorrente: boolean;
  recorrenciaFimData: string | null;
  origem: string;
  centroCusto: string | null;
  observacoes: string | null;
};

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const emptyForm = {
  descricao: "",
  fornecedor: "",
  categoriaId: "",
  tipo: "DESPESA" as "RECEITA" | "DESPESA",
  valor: "",
  dataVencimento: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [modoLote, setModoLote] = useState(false);

  async function carregar() {
    setLoading(true);
    const [resL, resC] = await Promise.all([
      apiFetch(`/api/lancamentos${somentePendentes ? "?pendentes=1" : ""}`),
      apiFetch("/api/categorias"),
    ]);
    if (resL.ok) setLancamentos(await resL.json());
    if (resC.ok) setCategorias(await resC.json());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [somentePendentes]);

  function abrirNovo() {
    setForm(emptyForm);
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

  const categoriasFiltradas = categorias.filter((c) => c.tipo === form.tipo);

  if (modoLote) {
    return <CategorizacaoEmLoteView onVoltar={() => { setModoLote(false); carregar(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : lancamentos.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum lançamento encontrado.</p>
      ) : (
        <div className="space-y-2">
          {lancamentos.map((l) => {
            const valorNum = Number(l.valor);
            return (
              <div key={l.id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium text-sm text-gray-900 truncate">{l.descricao}</p>
                    {l.recorrente && (
                      <span title="Recorrente" className="inline-flex items-center gap-0.5 text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        <Repeat className="w-3 h-3" /> recorrente
                      </span>
                    )}
                    {l.parcelaTotal && l.parcelaTotal > 1 && (
                      <span title="Parcelado" className="inline-flex items-center gap-0.5 text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                        <Layers className="w-3 h-3" /> {l.parcelaNumero}/{l.parcelaTotal}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDataBR(l.dataVencimento)} {l.fornecedor ? `· ${l.fornecedor}` : ""}
                  </p>
                  {!l.categoriaId ? (
                    <select
                      onChange={(e) => e.target.value && categorizar(l.id, e.target.value)}
                      defaultValue=""
                      className="mt-1.5 text-xs border border-amber-300 bg-amber-50 rounded px-2 py-1"
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
                    <p className="text-xs text-gray-500 mt-0.5">{l.categoria?.nome}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`font-semibold text-sm ${valorNum >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(l.valor)}</span>
                  <button onClick={() => excluir(l)} className="text-gray-300 hover:text-red-600" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
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
    </div>
  );
}
