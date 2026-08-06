"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, CheckCircle2, Circle, Repeat } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Orçamento — redesenho de 06/08/2026 (pedido do Felipe): mesma estrutura
// colapsável em árvore da tela DRE (Bloco -> Categoria), com um 3º nível
// dentro de cada categoria: os lançamentos PREVISTOS daquele mês
// (recorrentes ou pontuais, cumpridos ou não — ver lib/finance/orcamento.ts)
// e a "provisão de gastos não definidos" — um valor editável por
// categoria/mês, com o quanto já foi consumido (lançamentos "Lançamento
// Diverso" da conciliação) e o quanto resta. Nada aqui é gravado a mais: só
// a provisão em si é uma linha (FinanceOrcamento, já existia); previstos
// cumpridos/consumo são sempre calculados na hora pela API.
//
// (Bloco-level orçamento, que existia antes desta reescrita, saiu da árvore
// — a API só expõe provisão por CATEGORIA agora, que é o que o Felipe pediu
// explicitamente: "provisionamento de gastos esperados para aquela
// categoria naquele mês".)

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Totalizador = "MARGEM_BRUTA" | "DESPESAS" | "LUCRO_PREJUIZO_EXTRA";

type Previsto = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  recorrente: boolean;
  cumprido: boolean;
  lancamentoRealId: string | null;
};

type OrcamentoCategoria = {
  categoriaId: string;
  nome: string;
  tipo: string;
  blocoId: string;
  realizadoRS: string;
  previstos: Previsto[];
  totalPrevistosRS: string;
  provisaoRS: string | null;
  provisaoConsumidaRS: string;
  provisaoRestanteRS: string | null;
};

type OrcamentoBloco = {
  blocoId: string;
  nome: string;
  ordem: number;
  totalizador: Totalizador;
  realizadoRS: string;
};

type OrcamentoBlocoComCategorias = OrcamentoBloco & { categorias: OrcamentoCategoria[] };

type OrcamentoResponse = {
  mes: string;
  blocos: OrcamentoBlocoComCategorias[];
};

function mesAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function mesAdjacenteLocal(mes: string, delta: number): string {
  const [anoStr, mesStr] = mes.split("-");
  let ano = Number(anoStr);
  let mesNum = Number(mesStr) + delta;
  while (mesNum > 12) {
    mesNum -= 12;
    ano += 1;
  }
  while (mesNum < 1) {
    mesNum += 12;
    ano -= 1;
  }
  return `${ano}-${String(mesNum).padStart(2, "0")}`;
}

function formatBRL(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function labelMes(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  return `${MESES_PT[mesNum - 1]} de ${ano}`;
}

const COL_VALOR = "w-28 flex-shrink-0 text-right";

function Celula({ valor, destaque }: { valor: string | null; destaque?: boolean }) {
  const n = valor == null ? null : Number(valor);
  const positivo = n == null || n >= 0;
  return (
    <div className={`${COL_VALOR} ${destaque ? "font-bold" : "font-medium"} text-xs ${n == null ? "text-gray-300" : positivo ? "text-green-700" : "text-red-600"}`}>
      {n == null ? "—" : formatBRL(valor)}
    </div>
  );
}

function ValorInput({ valorInicial, onSalvar }: { valorInicial: string; onSalvar: (v: number) => void }) {
  const [valor, setValor] = useState(valorInicial);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => setValor(valorInicial), [valorInicial]);

  return (
    <div className="relative flex-shrink-0 w-28">
      <input
        type="number"
        step="0.01"
        min="0"
        className="input text-xs py-1.5 pr-6"
        value={valor}
        placeholder="0,00"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => {
          if (valor !== "" && Number(valor) !== Number(valorInicial || 0)) {
            onSalvar(Number(valor));
            setSalvo(true);
            setTimeout(() => setSalvo(false), 1500);
          }
        }}
      />
      {salvo && <Check className="w-3.5 h-3.5 text-green-600 absolute right-1.5 top-1/2 -translate-y-1/2" />}
    </div>
  );
}

function LinhaPrevisto({ previsto }: { previsto: Previsto }) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-1">
      {previsto.cumprido ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" aria-label="Cumprido" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" aria-label="Pendente" />
      )}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <p className="text-xs text-gray-600 truncate">{previsto.descricao}</p>
        {previsto.recorrente && <Repeat className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" aria-label="Recorrente" />}
      </div>
      <p className="text-[10px] text-gray-400 flex-shrink-0 w-8">{formatData(previsto.dataEfetiva)}</p>
      <Celula valor={previsto.valor} />
    </div>
  );
}

function LinhaCategoria({ categoria, onSalvarProvisao }: { categoria: OrcamentoCategoria; onSalvarProvisao: (categoriaId: string, valor: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const temAlgo = categoria.previstos.length > 0 || categoria.provisaoRS != null;

  return (
    <div>
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-2 px-1.5 py-1 rounded-lg text-left hover:bg-gray-50">
        {aberto ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        <p className="flex-1 min-w-0 truncate text-xs text-gray-700">{categoria.nome}</p>
        {temAlgo && <span className="text-[10px] text-gray-400 flex-shrink-0">{categoria.previstos.length} prev.</span>}
        <Celula valor={categoria.realizadoRS} />
      </button>

      {aberto && (
        <div className="ml-5 border-l border-gray-100 pl-2 pb-1 space-y-1.5">
          <div className="flex items-center gap-2 px-1.5 py-1 bg-gray-50 rounded-lg">
            <p className="flex-1 min-w-0 text-xs text-gray-600">Provisão (gastos não definidos)</p>
            {categoria.provisaoRS != null && (
              <div className="text-[10px] text-gray-400 flex-shrink-0 text-right">
                <p>consumido {formatBRL(categoria.provisaoConsumidaRS)}</p>
                <p className={Number(categoria.provisaoRestanteRS) < 0 ? "text-red-600 font-medium" : ""}>restante {formatBRL(categoria.provisaoRestanteRS)}</p>
              </div>
            )}
            <ValorInput valorInicial={categoria.provisaoRS ?? ""} onSalvar={(v) => onSalvarProvisao(categoria.categoriaId, v)} />
          </div>

          {categoria.previstos.length === 0 ? (
            <p className="text-[11px] text-gray-400 px-1.5">Nenhum lançamento previsto pra este mês.</p>
          ) : (
            categoria.previstos.map((p) => <LinhaPrevisto key={p.id} previsto={p} />)
          )}
        </div>
      )}
    </div>
  );
}

function LinhaBloco({ bloco }: { bloco: OrcamentoBlocoComCategorias & { onSalvarProvisao: (categoriaId: string, valor: number) => void } }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-gray-50">
        {aberto ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        <p className="flex-1 min-w-0 truncate text-xs font-semibold text-gray-800">{bloco.nome}</p>
        <Celula valor={bloco.realizadoRS} destaque />
      </button>

      {aberto && (
        <div className="ml-5 border-l border-gray-100 pl-2">
          {bloco.categorias.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Nenhuma categoria com movimento, previsão ou provisão neste mês.</p>
          ) : (
            bloco.categorias.map((c) => <LinhaCategoria key={c.categoriaId} categoria={c} onSalvarProvisao={bloco.onSalvarProvisao} />)
          )}
        </div>
      )}
    </div>
  );
}

export function OrcamentoView() {
  const [mes, setMes] = useState(mesAtualSP());
  const [dados, setDados] = useState<OrcamentoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    const res = await apiFetch(`/api/orcamento?mes=${mes}`);
    setDados(res.ok ? await res.json() : null);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function salvarProvisao(categoriaId: string, valor: number) {
    await apiFetch("/api/orcamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alvoTipo: "CATEGORIA", alvoChave: categoriaId, categoriaId, mes, valor }),
    });
    carregar();
  }

  const blocosDe = (t: Totalizador) => dados?.blocos.filter((b) => b.totalizador === t) ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-1.5">
        <button onClick={() => setMes(mesAdjacenteLocal(mes, -1))} className="btn-secondary px-1.5 py-1.5" aria-label="Mês anterior">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <h1 className="text-sm font-bold text-gray-900 px-1">{labelMes(mes)}</h1>
        <button onClick={() => setMes(mesAdjacenteLocal(mes, 1))} className="btn-secondary px-1.5 py-1.5" aria-label="Próximo mês">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        {mes !== mesAtualSP() && (
          <button onClick={() => setMes(mesAtualSP())} className="text-xs text-blue-700 font-medium hover:underline">
            hoje
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Abra uma categoria pra ver os lançamentos previstos do mês (recorrentes ou pontuais, cumpridos ou pendentes) e configurar a provisão de gastos não
        definidos.
      </p>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : !dados ? (
        <p className="text-red-600 text-sm">Erro ao carregar o orçamento.</p>
      ) : (
        <div className="space-y-0.5">
          {blocosDe("MARGEM_BRUTA").map((b) => (
            <LinhaBloco key={b.blocoId} bloco={{ ...b, onSalvarProvisao: salvarProvisao }} />
          ))}
          {blocosDe("DESPESAS").map((b) => (
            <LinhaBloco key={b.blocoId} bloco={{ ...b, onSalvarProvisao: salvarProvisao }} />
          ))}
          {blocosDe("LUCRO_PREJUIZO_EXTRA").map((b) => (
            <LinhaBloco key={b.blocoId} bloco={{ ...b, onSalvarProvisao: salvarProvisao }} />
          ))}
        </div>
      )}
    </div>
  );
}
