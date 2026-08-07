"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, X, Clock, Landmark, AlertTriangle, CheckCircle2, Bot } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorMes } from "@/components/SeletorMes";
import { InputMoeda } from "@/components/InputMoeda";
import { AbasTransacoes } from "./AbasTransacoes";

// Fluxo de Transações — pedido do Felipe, 07/08/2026: "No fluxo, deve
// haver um kanban com filtro mensal das transações. As colunas devem ser:
// Aprovação Gerencial, Aprovação Master, Executadas. [...] o movimento da
// coluna Aprovação Master para Executadas sempre deve ser automatizado, e
// nunca manual [...] Acima do kanban, deve ter um Score [...] Também deve
// ter um alerta de transações vencidas."
//
// Aprovação Master não tem NENHUM botão de confirmação — o cartão fica lá
// mostrando os dados bancários pro Master pagar pelo internet banking dele
// (Fase 1: o sistema não inicia o Pix sozinho), e some sozinho pra
// Executadas quando o cron detecta a transação real vinda da Pluggy (ver
// detectarExecucoesConfirmadas em @praxis/core). Rejeitar continua manual
// (Gerente ou Master desistindo do pagamento daquele mês), em qualquer uma
// das duas primeiras colunas.
//
// Identidade visual — pedido do Felipe, 07/08/2026: "deixe a tela Fluxo de
// Transações com essa identidade visual (Manutenção > Correções)". Réplica
// do padrão visual de apps/maintenance (kanban-execucao.tsx +
// correction-card-header.tsx): colunas como painéis brancos arredondados
// com ícone+título+contador no cabeçalho, cards com tonalidade de cor por
// status (neutro = aguardando, azul = em andamento/aguardando detecção,
// verde = concluído — mesmo espírito de "Planejadas"/"Executadas" lá), e
// badges em formato de pill (rounded-full, ícone + texto curto). Como
// apps/financeiro usa classes Tailwind fixas (não variáveis CSS do
// shadcn/ui como o maintenance), a réplica usa as cores hardcoded do
// próprio design system daqui (gray/blue/green/red/amber) em vez de
// var(--primary) etc., mas com a mesma composição visual.

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
  regra: { id: string; descricao: string; favorecido: string; dadosBancarios: string; categoriaNome: string; contaBancariaId: string | null; diaDoMes: number };
};

type Regra = { id: string; ativo: boolean };
type ContaBancaria = { id: string; nome: string; apelido: string | null };
type ContaConectada = { id: string; instituicao: string; contas: ContaBancaria[] };

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mesAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function hojeISOSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function formatDataHoraBR(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Data esperada de uma execução (mesReferencia + diaDoMes da regra,
// clampado pro último dia do mês) — usada tanto pro alerta de vencidas
// quanto pra ordenar os cartões dentro de cada coluna.
function dataEsperada(mesReferencia: string, diaDoMes: number): string {
  const [ano, mes] = mesReferencia.split("-").map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${mesReferencia}-${String(Math.min(diaDoMes, ultimoDia)).padStart(2, "0")}`;
}

const COLUNAS: { status: Status; titulo: string; icon: LucideIcon; corIcone: string; corCard: string }[] = [
  { status: "AGUARDANDO_GERENTE", titulo: "Aprovação Gerencial", icon: Clock, corIcone: "text-gray-400", corCard: "border-gray-200 bg-white" },
  { status: "AGUARDANDO_MASTER", titulo: "Aprovação Master", icon: Landmark, corIcone: "text-blue-500", corCard: "border-blue-200 bg-blue-50/50" },
  { status: "CONFIRMADA", titulo: "Executadas", icon: CheckCircle2, corIcone: "text-green-600", corCard: "border-green-200 bg-green-50/60" },
];

export function TransacoesFluxoView({ role }: { role: string }) {
  const [mes, setMes] = useState(mesAtualSP());
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [contasConectadas, setContasConectadas] = useState<ContaConectada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [valoresEdicao, setValoresEdicao] = useState<Record<string, string>>({});
  const [rejeitandoId, setRejeitandoId] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [mostrarVencidas, setMostrarVencidas] = useState(true);

  const podeConfirmarGerente = role === "GERENTE" || role === "MASTER";
  const podeRejeitar = role === "GERENTE" || role === "MASTER";

  async function carregar() {
    setLoading(true);
    const [resE, resR, resCt] = await Promise.all([apiFetch("/api/transacoes"), apiFetch("/api/transacoes-automatizadas"), apiFetch("/api/contas")]);
    if (resE.ok) setExecucoes(await resE.json());
    if (resR.ok) setRegras(await resR.json());
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
    () => contasConectadas.flatMap((cc) => cc.contas.map((c) => ({ ...c, nome: c.apelido || c.nome }))),
    [contasConectadas]
  );
  const contaPorId = useMemo(() => new Map(todasContas.map((c) => [c.id, c.nome])), [todasContas]);

  const execucoesDoMes = useMemo(() => execucoes.filter((e) => e.mesReferencia === mes), [execucoes, mes]);
  const rejeitadasDoMes = useMemo(() => execucoesDoMes.filter((e) => e.status === "REJEITADA"), [execucoesDoMes]);

  function ordenar(lista: Execucao[]): Execucao[] {
    return [...lista].sort((a, b) => dataEsperada(a.mesReferencia, a.regra.diaDoMes).localeCompare(dataEsperada(b.mesReferencia, b.regra.diaDoMes)));
  }

  // Score (pedido do Felipe): denominador = regras ATIVAS agora (não só as
  // que já geraram execução esse mês — evita o score parecer baixo demais
  // no início do mês, antes do cron rodar pra todas). Numerador = execuções
  // já Executadas nesse mês específico.
  const regrasAtivas = useMemo(() => regras.filter((r) => r.ativo).length, [regras]);
  const executadasNoMes = useMemo(() => execucoesDoMes.filter((e) => e.status === "CONFIRMADA").length, [execucoesDoMes]);

  // Vencidas (pedido do Felipe) — global, independente do filtro de mês:
  // ainda não Executada/Rejeitada e a data esperada já passou.
  const hoje = hojeISOSP();
  const vencidas = useMemo(() => {
    return execucoes
      .filter((e) => (e.status === "AGUARDANDO_GERENTE" || e.status === "AGUARDANDO_MASTER") && dataEsperada(e.mesReferencia, e.regra.diaDoMes) < hoje)
      .sort((a, b) => dataEsperada(a.mesReferencia, a.regra.diaDoMes).localeCompare(dataEsperada(b.mesReferencia, b.regra.diaDoMes)));
  }, [execucoes, hoje]);
  const vencidasIds = useMemo(() => new Set(vencidas.map((e) => e.id)), [vencidas]);

  function valorEdicaoDe(execucaoId: string, sugerido: string): string {
    return valoresEdicao[execucaoId] ?? sugerido;
  }

  async function confirmarGerente(execucaoId: string, valorSugerido: string) {
    // Bug corrigido (pedido do Felipe, 07/08/2026: "pq deu esse erro?"): o
    // fallback aqui era hardcoded "0" em vez do valor sugerido — se o
    // usuário clicasse Confirmar sem TOCAR no campo (aceitando o sugerido
    // como está, o caso mais comum), valoresEdicao[execucaoId] continuava
    // undefined e o cálculo virava 0, disparando "Informe um valor válido"
    // mesmo com um valor sugerido válido visível na tela.
    const valor = Number(valorEdicaoDe(execucaoId, valorSugerido).replace(",", "."));
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

  function Cartao({ e, corCard }: { e: Execucao; corCard: string }) {
    const atrasada = vencidasIds.has(e.id);
    return (
      <div className={`rounded-xl border ${corCard} p-3 space-y-2 text-sm`}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900">{e.regra.descricao}</p>
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 whitespace-nowrap">
            {e.regra.categoriaNome}
          </span>
        </div>
        <p className="text-xs text-gray-400">{e.regra.favorecido}</p>

        {atrasada && (e.status === "AGUARDANDO_GERENTE" || e.status === "AGUARDANDO_MASTER") && (
          <span className="flex items-center gap-0.5 w-fit rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
            <AlertTriangle className="h-2.5 w-2.5" /> Vencida
          </span>
        )}

        {e.status === "AGUARDANDO_GERENTE" && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">Sugerido: {formatBRL(e.valorSugerido)}</p>
            {podeConfirmarGerente && (
              <>
                <InputMoeda
                  className="input text-sm py-1 w-full"
                  value={valorEdicaoDe(e.id, e.valorSugerido)}
                  onChange={(v) => setValoresEdicao((prev) => ({ ...prev, [e.id]: v }))}
                />
                <div className="flex items-center gap-1.5">
                  <button onClick={() => confirmarGerente(e.id, e.valorSugerido)} disabled={processandoId === e.id} className="btn-primary rounded-xl flex-1 flex items-center justify-center gap-1 text-xs py-1.5">
                    <Check className="w-3.5 h-3.5" /> Confirmar
                  </button>
                  <button
                    onClick={() => setRejeitandoId(e.id)}
                    disabled={processandoId === e.id}
                    className="flex items-center justify-center gap-1 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-xl px-2.5 py-1.5"
                    title="Rejeitar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {e.status === "AGUARDANDO_MASTER" && (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-gray-900">{formatBRL(e.valorConfirmado ?? e.valorSugerido)}</p>
            <div className="bg-white/70 border border-blue-100 rounded-xl p-2 text-xs space-y-1">
              <p className="flex items-center gap-1 text-gray-700 font-medium">
                <Landmark className="w-3 h-3 flex-shrink-0" /> {e.regra.favorecido}
              </p>
              <p className="text-gray-500 whitespace-pre-wrap">{e.regra.dadosBancarios}</p>
              {e.regra.contaBancariaId && <p className="text-gray-400">Saída de: {contaPorId.get(e.regra.contaBancariaId) ?? "—"}</p>}
            </div>
            <p className="flex items-center gap-1 w-fit rounded-full bg-blue-100/70 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              <Bot className="h-2.5 w-2.5 flex-shrink-0" /> Move sozinho quando detectar o Pix
            </p>
            {podeRejeitar && (
              <button
                onClick={() => setRejeitandoId(e.id)}
                disabled={processandoId === e.id}
                className="flex items-center justify-center gap-1 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-xl px-2 py-1.5 w-full"
              >
                <X className="w-3.5 h-3.5" /> Rejeitar
              </button>
            )}
          </div>
        )}

        {e.status === "CONFIRMADA" && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {formatBRL(e.valorConfirmado ?? "0")}
            </p>
            <p className="text-[11px] text-gray-400">
              {e.confirmadoMasterPorNome} · {formatDataHoraBR(e.confirmadoMasterEm)}
            </p>
          </div>
        )}

        {rejeitandoId === e.id && (
          <div className="border-t border-gray-100 pt-2 space-y-1.5">
            <input className="input text-xs py-1" placeholder="Motivo (opcional)" value={motivoRejeicao} onChange={(ev) => setMotivoRejeicao(ev.target.value)} />
            <div className="flex items-center gap-1.5">
              <button onClick={() => rejeitar(e.id)} disabled={processandoId === e.id} className="text-xs bg-red-600 text-white rounded-xl px-2 py-1 flex-1">
                Confirmar rejeição
              </button>
              <button
                onClick={() => {
                  setRejeitandoId(null);
                  setMotivoRejeicao("");
                }}
                className="text-xs text-gray-500 px-2 py-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Fluxo de Transações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aprovação Gerencial → Aprovação Master → Executadas (detecção automática via Pluggy).</p>
        </div>
        <AbasTransacoes />
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {vencidas.length > 0 && mostrarVencidas && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {vencidas.length} transação{vencidas.length !== 1 ? "ões" : ""} vencida{vencidas.length !== 1 ? "s" : ""} — passou da data esperada sem
              confirmação.
            </p>
            <ul className="mt-1 space-y-0.5">
              {vencidas.map((e) => (
                <li key={e.id} className="text-xs">
                  {e.regra.descricao} — esperado {dataEsperada(e.mesReferencia, e.regra.diaDoMes).split("-").reverse().join("/")} ({e.status === "AGUARDANDO_GERENTE" ? "Aprovação Gerencial" : "Aprovação Master"})
                </li>
              ))}
            </ul>
          </div>
          <button onClick={() => setMostrarVencidas(false)} className="text-amber-600 hover:text-amber-900 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <SeletorMes mes={mes} onChange={setMes} />
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-gray-500">Score do mês:</span>
          <span className="font-semibold text-gray-900">
            {executadasNoMes} de {regrasAtivas}
          </span>
          <span className="text-gray-400">transações executadas</span>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUNAS.map((col) => {
            const itens = ordenar(execucoesDoMes.filter((e) => e.status === col.status));
            return (
              <div key={col.status} className="flex max-h-[75vh] flex-col rounded-2xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <col.icon className={`h-4 w-4 ${col.corIcone}`} />
                  <h2 className="text-sm font-semibold text-gray-900">{col.titulo}</h2>
                  <span className="text-xs text-gray-400">({itens.length})</span>
                </div>
                <div className="space-y-3 overflow-y-auto pr-1">
                  {itens.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">Nada aqui.</p>
                  ) : (
                    itens.map((e) => <Cartao key={e.id} e={e} corCard={col.corCard} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejeitadasDoMes.length > 0 && (
        <p className="text-xs text-gray-400">
          {rejeitadasDoMes.length} rejeitada{rejeitadasDoMes.length !== 1 ? "s" : ""} este mês: {rejeitadasDoMes.map((e) => e.regra.descricao).join(", ")}
        </p>
      )}
    </div>
  );
}
