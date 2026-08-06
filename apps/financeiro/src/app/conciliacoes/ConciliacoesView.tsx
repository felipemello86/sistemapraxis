"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCheck } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Tela de Conciliações (pedido do Felipe, 06/08/2026, item 5): forma
// alternativa (à coluna Conciliação de Lançamentos, um por um) de fazer o
// mesmo processo em LOTE — lista todo lançamento PLUGGY ainda pendente de
// conciliação, já com a(s) sugestão(ões) do sistema (ver
// lib/finance/conciliacao.ts), e deixa selecionar vários de uma vez pra
// confirmar de uma tacada só.

type Categoria = { id: string; nome: string; tipo: string };

type SugestaoConciliacao = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  recorrente: boolean;
  categoriaId: string | null;
  confianca: number;
};

type LancamentoPendente = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataVencimento: string;
  dataCompetencia: string | null;
  categoriaId: string | null;
};

type ItemPendente = {
  lancamento: LancamentoPendente;
  sugestoes: SugestaoConciliacao[];
  melhorSugestao: SugestaoConciliacao | null;
};

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIVERSO = "__DIVERSO__";
const NAO_CONCILIAR = "";

function mesAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function mesAdjacenteLocal(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]} de ${ano}`;
}

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function ConciliacoesView() {
  const [mes, setMes] = useState(mesAtualSP());
  const [pendentes, setPendentes] = useState<ItemPendente[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({}); // lancamentoId -> previstoId | DIVERSO | ""
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState("");

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  async function carregar() {
    setLoading(true);
    setResultado("");
    const [resP, resC] = await Promise.all([apiFetch(`/api/conciliacao?mes=${mes}`), apiFetch("/api/categorias")]);
    const itens: ItemPendente[] = resP.ok ? await resP.json() : [];
    setPendentes(itens);
    if (resC.ok) setCategorias(await resC.json());

    // default: linhas com sugestão forte (>=70%) já vêm marcadas e
    // pré-selecionadas — só precisa clicar "Conciliar selecionados" se
    // concordar com tudo que o sistema propôs.
    const escolhasIniciais: Record<string, string> = {};
    const selecaoInicial = new Set<string>();
    for (const item of itens) {
      if (item.melhorSugestao) {
        escolhasIniciais[item.lancamento.id] = item.melhorSugestao.id;
        if (item.melhorSugestao.confianca >= 70) selecaoInicial.add(item.lancamento.id);
      } else {
        escolhasIniciais[item.lancamento.id] = NAO_CONCILIAR;
      }
    }
    setEscolhas(escolhasIniciais);
    setSelecionados(selecaoInicial);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function mudarEscolha(id: string, valor: string) {
    setEscolhas((prev) => ({ ...prev, [id]: valor }));
    // escolher algo automaticamente marca a linha; "Não conciliar" desmarca
    setSelecionados((prev) => {
      const next = new Set(prev);
      valor === NAO_CONCILIAR ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selecionarTodasComSugestao() {
    const comSugestao = pendentes.filter((p) => escolhas[p.lancamento.id] && escolhas[p.lancamento.id] !== NAO_CONCILIAR).map((p) => p.lancamento.id);
    setSelecionados(new Set(comSugestao));
  }

  async function confirmarSelecionados() {
    const alvos = pendentes.filter((p) => selecionados.has(p.lancamento.id) && escolhas[p.lancamento.id]);
    if (alvos.length === 0) return;
    setSalvando(true);
    setResultado("");
    try {
      const confirmacoes = alvos
        .filter((p) => escolhas[p.lancamento.id] !== DIVERSO)
        .map((p) => ({
          lancamentoId: p.lancamento.id,
          previstoId: escolhas[p.lancamento.id],
          mesReferencia: (p.lancamento.dataCompetencia || p.lancamento.dataVencimento).slice(0, 7),
        }));
      const diversos = alvos.filter((p) => escolhas[p.lancamento.id] === DIVERSO);

      const [resConfirmacoes, resultadosDiversos] = await Promise.all([
        confirmacoes.length > 0
          ? apiFetch("/api/conciliacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmacoes }) })
          : null,
        Promise.all(
          diversos.map((p) =>
            apiFetch("/api/conciliacao", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lancamentoId: p.lancamento.id, diverso: true }),
            })
          )
        ),
      ]);

      let ok = diversos.length;
      let erros = 0;
      if (resConfirmacoes) {
        const data = await resConfirmacoes.json().catch(() => ({ ok: 0, erros: [] }));
        ok += data.ok || 0;
        erros += (data.erros || []).length;
      }
      erros += resultadosDiversos.filter((r) => !r.ok).length;

      setResultado(`${ok} conciliação${ok !== 1 ? "ões" : ""} confirmada${ok !== 1 ? "s" : ""}${erros > 0 ? `, ${erros} com erro` : ""}.`);
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  const totalSelecionados = selecionados.size;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-gray-900">Conciliações</h1>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMes(mesAdjacenteLocal(mes, -1))} className="btn-secondary px-1.5 py-1.5" aria-label="Mês anterior">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-sm font-medium text-gray-700 px-1 min-w-[9rem] text-center">{mesLabel(mes)}</span>
          <button onClick={() => setMes(mesAdjacenteLocal(mes, 1))} className="btn-secondary px-1.5 py-1.5" aria-label="Próximo mês">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Lançamentos importados do extrato/fatura ainda não conciliados neste mês. Pra cada um, escolha o lançamento previsto que ele cumpre (ou "Lançamento
        Diverso" se não houver previsão específica) e confirme vários de uma vez.
      </p>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : pendentes.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum lançamento pendente de conciliação neste mês. 🎉</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <button onClick={selecionarTodasComSugestao} className="text-xs text-blue-700 font-medium hover:underline">
              Selecionar todas com sugestão
            </button>
            <p className="text-xs text-gray-400">{totalSelecionados} selecionado(s)</p>
          </div>

          {resultado && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{resultado}</p>}

          <div className="card !p-0 divide-y divide-gray-50">
            {pendentes.map((item) => {
              const escolha = escolhas[item.lancamento.id] ?? NAO_CONCILIAR;
              return (
                <div key={item.lancamento.id} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selecionados.has(item.lancamento.id)}
                    disabled={escolha === NAO_CONCILIAR}
                    onChange={() => toggleSelecionado(item.lancamento.id)}
                    className="flex-shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{item.lancamento.descricao}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {formatDataBR(item.lancamento.dataVencimento)} · {categoriaPorId.get(item.lancamento.categoriaId || "") || "sem categoria"}
                    </p>
                  </div>

                  <p className="w-24 flex-shrink-0 text-right text-xs font-semibold text-red-600">{formatBRL(item.lancamento.valor)}</p>

                  <div className="w-64 flex-shrink-0">
                    <select value={escolha} onChange={(e) => mudarEscolha(item.lancamento.id, e.target.value)} className="input text-xs py-1.5 w-full">
                      <option value={NAO_CONCILIAR}>Não conciliar</option>
                      {item.sugestoes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.confianca}% — {s.descricao} ({formatBRL(s.valor)}){s.recorrente ? " ↻" : ""}
                        </option>
                      ))}
                      <option value={DIVERSO}>Lançamento Diverso (sem previsão)</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={confirmarSelecionados} disabled={salvando || totalSelecionados === 0} className="btn-primary w-full flex items-center justify-center gap-1.5">
            <CheckCheck className="w-4 h-4" />
            {salvando ? "Confirmando..." : `Conciliar selecionados (${totalSelecionados})`}
          </button>
        </>
      )}
    </div>
  );
}
