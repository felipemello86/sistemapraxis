"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Pencil, Trash2, AlertTriangle, Repeat } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorCentroCusto } from "@/components/SeletorCentroCusto";
import { InputMoeda } from "@/components/InputMoeda";
import { AbasTransacoes } from "./AbasTransacoes";

// Cadastro de Transações — pedido do Felipe, 07/08/2026: "Divida a tela
// Transações em Cadastro de Transações e Fluxo de Transações. No cadastro,
// pode-se editar, adicionar e excluir as transações, consultar as
// transações cadastradas." CRUD completo das REGRAS (FinanceTransacaoAutomatizada)
// — o "todo dia 1º pagar R$468 pro Jurandir" em si. Ver TransacoesFluxoView
// pro kanban de aprovação mensal (execuções geradas a partir daqui).

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

export function TransacoesCadastroView({ role }: { role: string }) {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [contasConectadas, setContasConectadas] = useState<ContaConectada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [formAberto, setFormAberto] = useState(false);
  const [regraEditandoId, setRegraEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(REGRA_VAZIA);
  const [salvandoRegra, setSalvandoRegra] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const podeGerenciar = role === "MASTER";

  async function carregar() {
    setLoading(true);
    const [resR, resC, resEmp, resU, resCt] = await Promise.all([
      apiFetch("/api/transacoes-automatizadas"),
      apiFetch("/api/categorias"),
      apiFetch("/api/empreendimentos"),
      apiFetch("/api/unidades"),
      apiFetch("/api/contas"),
    ]);
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

  const todasContas = useMemo(
    () => contasConectadas.flatMap((cc) => cc.contas.map((c) => ({ ...c, nome: c.apelido || c.nome, instituicao: cc.instituicao }))),
    [contasConectadas]
  );
  const contaPorId = useMemo(() => new Map(todasContas.map((c) => [c.id, c.nome])), [todasContas]);
  const categoriasDespesa = useMemo(() => categorias.filter((c) => c.tipo === "DESPESA"), [categorias]);

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

  async function excluir(r: Regra) {
    setErro("");
    setExcluindoId(r.id);
    const res = await apiFetch(`/api/transacoes-automatizadas?id=${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao excluir.");
    } else {
      await carregar();
    }
    setExcluindoId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Cadastro de Transações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pagamentos recorrentes a terceiros — o que cadastrar aqui vira pendência automática todo mês.</p>
        </div>
        <AbasTransacoes />
      </div>

      {!podeGerenciar && <p className="text-xs text-gray-400">Seu perfil só visualiza o cadastro — só o Master pode adicionar, editar ou excluir.</p>}

      {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {podeGerenciar && (
        <button onClick={abrirNovaRegra} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Nova transação automatizada
        </button>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : regras.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhuma transação automatizada cadastrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {regras.map((r) => (
            <div key={r.id} className={`card flex items-center justify-between gap-3 flex-wrap ${!r.ativo ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2 min-w-0">
                <Repeat className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{r.descricao}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {r.favorecido} · {formatBRL(r.valor)} todo dia {r.diaDoMes} · {r.categoria.nome}
                    {r.contaBancariaId && ` · ${contaPorId.get(r.contaBancariaId) ?? "—"}`}
                    {!r.ativo && " · Desativada"}
                  </p>
                </div>
              </div>
              {podeGerenciar && (
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => abrirEdicaoRegra(r)} className="text-gray-400 hover:text-gray-700" title="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => alternarAtivo(r)} className="text-xs text-gray-500 hover:text-gray-800 underline">
                    {r.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button onClick={() => excluir(r)} disabled={excluindoId === r.id} className="text-gray-400 hover:text-red-600" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
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
              O sistema não envia o Pix sozinho. Ele gera a pendência no dia configurado, o Gerente confirma o valor e detecta sozinho quando o Master
              paga pelo internet banking (ver Fluxo de Transações).
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
                <InputMoeda value={form.valor} onChange={(v) => setForm((f) => ({ ...f, valor: v }))} />
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
              <label className="label">Conta de origem (recomendado — usada pra detectar o pagamento automaticamente)</label>
              <select className="input" value={form.contaBancariaId} onChange={(e) => setForm((f) => ({ ...f, contaBancariaId: e.target.value }))}>
                <option value="">Não informar</option>
                {todasContas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — {c.instituicao}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Sem conta informada, a detecção automática exige que o nome do favorecido apareça na descrição do Pix — mais seguro informar a conta.
              </p>
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
