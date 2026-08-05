"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Tela principal do módulo (requisito 1 do Felipe: "DRE viva") — mostra o
// mês atual por padrão, com navegação livre pra qualquer mês passado ou
// futuro (requisito 2). O cálculo em si (fórmula fixa, projeção de
// recorrência) vive inteiramente em @praxis/core (lib/finance/dre.ts);
// esta tela só chama /api/dre?mes=YYYY-MM e desenha o resultado.

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Duplicado de @praxis/core/finance/dre.ts de propósito: este é um
// componente client, e @praxis/core importa `prisma` (singleton
// PrismaClient, Node-only) no módulo — importar o pacote inteiro aqui
// quebraria o bundle do navegador. Só os rótulos, puramente estáticos,
// precisam existir dos dois lados.
const DRE_BLOCO_LABELS: Record<string, string> = {
  RECEITA_BRUTA: "Receita Bruta",
  GASTOS_VARIAVEIS: "Gastos Variáveis",
  DESPESAS_VEICULOS: "Despesas com Veículos e Transporte",
  DESPESAS_FUNCIONARIOS: "Despesas com Funcionários",
  DESPESAS_ADMINISTRATIVAS: "Despesas Administrativas e Comerciais",
  DESPESAS_SEDE: "Despesas com Sede e Estrutura",
  DESPESAS_DIRETORIA: "Despesas com Diretoria",
  FINANCEIRAS: "Despesas e Receitas Financeiras",
};

type DreLinha = {
  id: string;
  categoriaId: string | null;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  projetadaDeRecorrencia: boolean;
};

type DreCategoria = {
  categoriaId: string;
  nome: string;
  bloco: string;
  total: string;
  orcado: string | null;
  lancamentos: DreLinha[];
};

type DreBlocoResumo = {
  bloco: string;
  total: string;
  orcado: string | null;
  categorias: DreCategoria[];
};

type DreResponse = {
  mes: string;
  blocos: DreBlocoResumo[];
  margemBrutaRS: string;
  despesasRS: string;
  geracaoDeCaixaRS: string;
  lucroPrejuizoRS: string;
  pendentesCategorizacao: DreLinha[];
  mesAnterior: string;
  mesSeguinte: string;
};

function mesAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelMes(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  return `${MESES_PT[mesNum - 1]} de ${ano}`;
}

function RollupCard({ titulo, valor }: { titulo: string; valor: string }) {
  const n = Number(valor);
  const positivo = n >= 0;
  return (
    <div className="card">
      <p className="text-xs font-medium text-gray-500 mb-1">{titulo}</p>
      <p className={`text-xl font-bold ${positivo ? "text-green-700" : "text-red-600"}`}>{formatBRL(valor)}</p>
    </div>
  );
}

function BlocoCard({ bloco }: { bloco: DreBlocoResumo }) {
  const [aberto, setAberto] = useState(false);
  const total = Number(bloco.total);
  const orcado = bloco.orcado != null ? Number(bloco.orcado) : null;
  // Orçamento é sempre positivo (ver schema); comparamos contra o valor
  // absoluto do realizado pra dar "% do orçamento consumido" mesmo em
  // blocos de despesa (valor negativo).
  const pctOrcamento = orcado && orcado > 0 ? (Math.abs(total) / orcado) * 100 : null;
  const estourou = pctOrcamento != null && pctOrcamento > 100;

  return (
    <div className="card">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center justify-between text-left">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900">{DRE_BLOCO_LABELS[bloco.bloco] ?? bloco.bloco}</p>
          {pctOrcamento != null && (
            <p className={`text-xs mt-0.5 ${estourou ? "text-red-600" : "text-gray-400"}`}>
              {pctOrcamento.toFixed(0)}% do orçamento ({formatBRL(bloco.orcado!)}){estourou ? " — estourou" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`font-bold ${total >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(bloco.total)}</span>
          {aberto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {aberto && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {bloco.categorias.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum lançamento categorizado neste bloco.</p>
          ) : (
            bloco.categorias.map((c) => {
              const cTotal = Number(c.total);
              const cOrcado = c.orcado != null ? Number(c.orcado) : null;
              const cPct = cOrcado && cOrcado > 0 ? (Math.abs(cTotal) / cOrcado) * 100 : null;
              return (
                <div key={c.categoriaId} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="text-gray-700 truncate">{c.nome}</p>
                    {cPct != null && (
                      <p className={`text-xs ${cPct > 100 ? "text-red-600" : "text-gray-400"}`}>
                        {cPct.toFixed(0)}% de {formatBRL(c.orcado!)}
                      </p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 ${cTotal >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(c.total)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function DreView() {
  const [mes, setMes] = useState<string>(mesAtualSP());
  const [dre, setDre] = useState<DreResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/dre?mes=${mes}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDre(data))
      .finally(() => setLoading(false));
  }, [mes]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => dre && setMes(dre.mesAnterior)} className="btn-secondary px-2 py-2" aria-label="Mês anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 min-w-[180px] text-center">{labelMes(mes)}</h1>
          <button onClick={() => dre && setMes(dre.mesSeguinte)} className="btn-secondary px-2 py-2" aria-label="Mês seguinte">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {mes !== mesAtualSP() && (
          <button onClick={() => setMes(mesAtualSP())} className="text-sm text-blue-700 font-medium hover:underline">
            Voltar pro mês atual
          </button>
        )}
      </div>

      {loading || !dre ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <>
          {dre.pendentesCategorizacao.length > 0 && (
            <a
              href="/lancamentos?pendentes=1"
              className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">
                  {dre.pendentesCategorizacao.length} lançamento{dre.pendentesCategorizacao.length > 1 ? "s" : ""} sem categoria
                </p>
                <p className="text-xs mt-0.5">Toque pra categorizar — eles não entram na DRE até isso ser resolvido.</p>
              </div>
            </a>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <RollupCard titulo="Margem Bruta" valor={dre.margemBrutaRS} />
            <RollupCard titulo="Despesas" valor={dre.despesasRS} />
            <RollupCard titulo="Geração de Caixa" valor={dre.geracaoDeCaixaRS} />
            <RollupCard titulo="Lucro / Prejuízo" valor={dre.lucroPrejuizoRS} />
          </div>

          <div className="space-y-2">
            {dre.blocos.map((b) => (
              <BlocoCard key={b.bloco} bloco={b} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
