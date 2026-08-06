"use client";
import { useEffect, useState } from "react";
import { Link2, Search, Repeat, Landmark, FileText } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorCentroCusto, type Empreendimento, type Unidade } from "@/components/SeletorCentroCusto";
import { BuscarLancamentoModal, type LancamentoEscolhido } from "@/components/BuscarLancamentoModal";
import { RepetirLancamentoModal, repetirConfigPadrao, resumoRepeticao, type RepetirConfig, type ContaParaSelect } from "@/components/RepetirLancamentoModal";

// Redesign da tela de Conciliações (pedido do Felipe, 06/08/2026) —
// espelha o layout do Conta Azul: dois cards que "se conectam". O
// esquerdo ("Lançamento do banco") é sempre só leitura — o dado bruto
// importado. O direito ("Lançamento proposto") tem duas abas mutuamente
// exclusivas:
//   - "Lançamento previsto": o sistema já sugeriu um candidato (ver
//     lib/finance/conciliacao.ts#sugerirConciliacao) ou o usuário achou um
//     via "Buscar lançamento" (popup com a árvore da DRE, ver
//     BuscarLancamentoModal).
//   - "Novo lançamento": não há previsão — a pessoa cadastra ali mesmo
//     (descrição/categoria/centro de custo), com a opção de "Repetir
//     Lançamento" pra virar uma expectativa nos meses seguintes no
//     Orçamento (ver RepetirLancamentoModal).
// O botão de conexão no meio confirma — chama /api/conciliacao com o body
// certo pra cada aba (ver conciliacao.ts#confirmarConciliacao /
// #criarEConciliar).

type Categoria = { id: string; nome: string; tipo: string };

type Previsto = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  recorrente: boolean;
  categoriaId: string | null;
  confianca?: number; // só quando vem de sugestão automática
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

export type ItemPendente = {
  lancamento: LancamentoPendente;
  sugestoes: Previsto[];
  melhorSugestao: Previsto | null;
};

const NOMES_DIA = ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"];

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function nomeDiaSemana(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return NOMES_DIA[new Date(ano, mes - 1, dia).getDay()];
}

export function ConciliacaoDetalhe({
  item,
  categorias,
  empreendimentos,
  unidades,
  contas,
  onConciliado,
}: {
  item: ItemPendente;
  categorias: Categoria[];
  empreendimentos: Empreendimento[];
  unidades: Unidade[];
  contas: ContaParaSelect[];
  onConciliado: () => void;
}) {
  const [modo, setModo] = useState<"previsto" | "novo">(item.melhorSugestao ? "previsto" : "novo");
  const [previstoEscolhidoId, setPrevistoEscolhidoId] = useState<string>(item.melhorSugestao?.id ?? "");
  const [previstoManual, setPrevistoManual] = useState<Previsto | null>(null); // achado via "Buscar lançamento"
  const [buscarAberto, setBuscarAberto] = useState(false);
  const [repetirAberto, setRepetirAberto] = useState(false);

  const [descricao, setDescricao] = useState(item.lancamento.descricao);
  const [categoriaId, setCategoriaId] = useState(item.lancamento.categoriaId ?? "");
  const [centroCustoTipo, setCentroCustoTipo] = useState<"ADMINISTRACAO" | "EMPREENDIMENTO" | "UNIDADE">("ADMINISTRACAO");
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [uhId, setUhId] = useState<string | null>(null);
  const [repetir, setRepetir] = useState<RepetirConfig>(repetirConfigPadrao(item.lancamento.dataVencimento));

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Reseta todo o estado do card proposto sempre que o item focado muda
  // (troca de lançamento na lista à esquerda) — cada lançamento tem sua
  // própria proposta, não deve arrastar o que ficou preenchido pro anterior.
  useEffect(() => {
    setModo(item.melhorSugestao ? "previsto" : "novo");
    setPrevistoEscolhidoId(item.melhorSugestao?.id ?? "");
    setPrevistoManual(null);
    setDescricao(item.lancamento.descricao);
    setCategoriaId(item.lancamento.categoriaId ?? "");
    setCentroCustoTipo("ADMINISTRACAO");
    setPropertyId(null);
    setUhId(null);
    setRepetir(repetirConfigPadrao(item.lancamento.dataVencimento));
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.lancamento.id]);

  const valorNum = Number(item.lancamento.valor);
  const categoriasFiltradas = categorias.filter((c) => c.tipo === (valorNum >= 0 ? "RECEITA" : "DESPESA"));
  const candidatos: Previsto[] = previstoManual ? [previstoManual, ...item.sugestoes.filter((s) => s.id !== previstoManual.id)] : item.sugestoes;
  const previstoAtivo = candidatos.find((c) => c.id === previstoEscolhidoId) ?? null;

  function escolherViaBusca(l: LancamentoEscolhido) {
    const previsto: Previsto = { ...l };
    setPrevistoManual(previsto);
    setPrevistoEscolhidoId(previsto.id);
    setModo("previsto");
    setBuscarAberto(false);
  }

  async function conciliar() {
    setErro("");
    if (modo === "previsto") {
      if (!previstoAtivo) {
        setErro("Escolha um lançamento previsto (ou busque um, ou troque pra \"Novo lançamento\").");
        return;
      }
      setSalvando(true);
      try {
        const mesReferencia = (item.lancamento.dataCompetencia || item.lancamento.dataVencimento).slice(0, 7);
        const res = await apiFetch("/api/conciliacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lancamentoId: item.lancamento.id, previstoId: previstoAtivo.id, mesReferencia }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErro(data.error || "Erro ao conciliar.");
          return;
        }
        onConciliado();
      } finally {
        setSalvando(false);
      }
      return;
    }

    // modo === "novo"
    if (!descricao.trim()) {
      setErro("Descrição é obrigatória.");
      return;
    }
    if (!categoriaId) {
      setErro("Escolha uma categoria.");
      return;
    }
    if (centroCustoTipo === "EMPREENDIMENTO" && !propertyId) {
      setErro("Escolha o empreendimento.");
      return;
    }
    if (centroCustoTipo === "UNIDADE" && !uhId) {
      setErro("Escolha a unidade.");
      return;
    }
    setSalvando(true);
    try {
      const res = await apiFetch("/api/conciliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lancamentoId: item.lancamento.id,
          novo: {
            descricao,
            categoriaId,
            centroCustoTipo,
            propertyId: centroCustoTipo === "EMPREENDIMENTO" ? propertyId : null,
            uhId: centroCustoTipo === "UNIDADE" ? uhId : null,
            dataVencimento: repetir.habilitado ? repetir.primeiroVencimento : item.lancamento.dataVencimento,
            recorrente: repetir.habilitado,
            recorrenciaFrequencia: repetir.frequencia,
            recorrenciaQtde: repetir.habilitado && repetir.qtdeTipo === "numero" ? repetir.qtdeNumero : null,
            contaBancariaId: repetir.contaBancariaId || null,
            formaPagamento: repetir.formaPagamento || null,
            observacoes: repetir.observacoes || null,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.error || "Erro ao criar e conciliar.");
        return;
      }
      onConciliado();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-start">
        {/* Card esquerdo: Lançamento do banco (sempre leitura) */}
        <div className="card space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <Landmark className="w-3.5 h-3.5" /> Lançamento do banco
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{formatDataBR(item.lancamento.dataVencimento)}</p>
              <p className="text-xs text-gray-400">{nomeDiaSemana(item.lancamento.dataVencimento)}</p>
            </div>
            <p className={`text-lg font-bold ${valorNum >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(item.lancamento.valor)}</p>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-sm text-gray-800">{item.lancamento.descricao}</p>
            {item.lancamento.fornecedor && <p className="text-xs text-gray-400 mt-0.5">{item.lancamento.fornecedor}</p>}
          </div>
        </div>

        {/* Botão de conexão no meio */}
        <div className="flex md:flex-col items-center justify-center gap-2 md:pt-16">
          <button
            onClick={conciliar}
            disabled={salvando}
            className="w-11 h-11 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center shadow-md disabled:opacity-50 flex-shrink-0"
            title="Conciliar"
          >
            <Link2 className="w-5 h-5" />
          </button>
          <span className="text-[11px] text-gray-400 font-medium hidden md:block">{salvando ? "Salvando..." : "Conciliar"}</span>
        </div>

        {/* Card direito: Lançamento proposto */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <FileText className="w-3.5 h-3.5" /> Lançamento proposto
            </div>
            <button onClick={() => setBuscarAberto(true)} className="flex items-center gap-1 text-xs text-blue-700 font-medium hover:underline">
              <Search className="w-3 h-3" /> Buscar lançamento
            </button>
          </div>

          <div className="flex gap-1.5 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setModo("previsto")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md ${modo === "previsto" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Lançamento previsto
            </button>
            <button
              onClick={() => setModo("novo")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md ${modo === "novo" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Novo lançamento
            </button>
          </div>

          {modo === "previsto" ? (
            candidatos.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                Nenhuma sugestão automática. Use "Buscar lançamento" acima, ou troque pra "Novo lançamento".
              </p>
            ) : (
              <div className="space-y-2">
                <select className="input text-sm w-full" value={previstoEscolhidoId} onChange={(e) => setPrevistoEscolhidoId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.confianca != null ? `${c.confianca}% — ` : ""}
                      {c.descricao} ({formatBRL(c.valor)}){c.recorrente ? " ↻" : ""}
                    </option>
                  ))}
                </select>
                {previstoAtivo && (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {formatDataBR(previstoAtivo.dataEfetiva)} · {formatBRL(previstoAtivo.valor)}
                    {previstoAtivo.recorrente && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-blue-600">
                        <Repeat className="w-3 h-3" /> recorrente
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label">Descrição</label>
                <input className="input text-sm" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input text-sm" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {categoriasFiltradas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <SeletorCentroCusto
                tipo={centroCustoTipo}
                empreendimentoId={propertyId}
                unidadeId={uhId}
                empreendimentos={empreendimentos}
                unidades={unidades}
                onChange={(v) => {
                  setCentroCustoTipo(v.centroCustoTipo);
                  setPropertyId(v.empreendimentoId);
                  setUhId(v.unidadeId);
                }}
              />
              <button
                type="button"
                onClick={() => setRepetirAberto(true)}
                className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border ${
                  repetir.habilitado ? "border-gray-900 bg-gray-50 text-gray-900" : "border-gray-300 text-gray-600"
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
                {resumoRepeticao(repetir)}
              </button>
            </div>
          )}
        </div>
      </div>

      <BuscarLancamentoModal
        open={buscarAberto}
        onClose={() => setBuscarAberto(false)}
        mesInicial={(item.lancamento.dataCompetencia || item.lancamento.dataVencimento).slice(0, 7)}
        onEscolher={escolherViaBusca}
      />
      <RepetirLancamentoModal open={repetirAberto} onClose={() => setRepetirAberto(false)} value={repetir} onChange={setRepetir} contas={contas} />
    </div>
  );
}
