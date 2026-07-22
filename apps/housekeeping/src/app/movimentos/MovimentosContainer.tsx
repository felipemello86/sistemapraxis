"use client";
import { useState, useEffect } from "react";
import { BarChart3, WashingMachine, TrendingUp } from "lucide-react";
import PerformanceView from "./PerformanceView";
import EtapasView from "./EtapasView";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/movimentos/MovimentosContainer.tsx (v1).
// fetch(...) → apiFetch(...); resto idêntico.

// ── Lavanderia View (inline) ──────────────────────────────────────────────────
type FalhaDia = { data: string; total: number };

function fmtData(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

// Últimos 7 dias (hoje incluso), formato "YYYY-MM-DD" — usado pra sempre
// mostrar os 7 dias no gráfico, com 0 nos dias sem falha (a API só retorna
// os dias que TIVERAM falha, então preenchemos os buracos aqui).
function ultimos7Dias(): string[] {
  const dias: string[] = [];
  const hoje = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    dias.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return dias;
}

function LavandariaView() {
  const [falhas, setFalhas] = useState<FalhaDia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/falha-lavanderia")
      .then((r) => r.json())
      .then((data) => { setFalhas(data); setLoading(false); });
  }, []);

  const total = falhas.reduce((s, f) => s + f.total, 0);
  const ultimoRegistro = falhas.length > 0 ? falhas[falhas.length - 1] : null;

  // Dados dos últimos 7 dias (zero-preenchidos) + acumulado dentro dessa
  // janela de 7 dias, pra linha do eixo secundário.
  const mapaFalhas = new Map(falhas.map((f) => [f.data, f.total]));
  let acumulado = 0;
  const dadosGrafico = ultimos7Dias().map((data) => {
    const totalDia = mapaFalhas.get(data) ?? 0;
    acumulado += totalDia;
    return { data, total: totalDia, acumulado };
  });

  if (loading) return <div className="text-center py-20 text-gray-400">Carregando...</div>;

  return (
    <div className="space-y-4">
      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Total de falhas</p>
          <p className={`text-3xl font-bold mt-1 ${total > 0 ? "text-amber-600" : "text-green-600"}`}>{total}</p>
          <p className="text-xs text-gray-400 mt-1">registros acumulados</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Dias com ocorrência</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{falhas.length}</p>
          <p className="text-xs text-gray-400 mt-1">dias distintos</p>
        </div>
      </div>

      {/* Gráfico — sempre os últimos 7 dias (com 0 nos dias sem falha) +
          linha de falhas acumuladas na janela, com eixo secundário. */}
      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <WashingMachine className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-gray-900">Falhas por dia (últimos 7 dias)</h3>
          </div>
          {/* "Último registro" como texto simples aqui dentro, em vez de um
              card próprio — não precisa do espaço de um card só pra isso. */}
          {ultimoRegistro && (
            <span className="text-xs text-gray-400">
              Último registro: {fmtData(ultimoRegistro.data)} · {ultimoRegistro.total} falha(s)
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={dadosGrafico} margin={{ left: 0, right: 10 }}>
            <XAxis dataKey="data" tickFormatter={fmtData} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="dia" allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <YAxis
              yAxisId="acumulado"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#6366f1" }}
              width={28}
            />
            <Tooltip
              formatter={(v: number, name: string) => [v, name === "total" ? "Falhas no dia" : "Acumulado (7d)"]}
              labelFormatter={(l) => {
                const [ano, mes, dia] = l.split("-");
                return `${dia}/${mes}/${ano}`;
              }}
            />
            <Bar yAxisId="dia" dataKey="total" fill="#d97706" radius={[4, 4, 0, 0]} />
            <Line yAxisId="acumulado" dataKey="acumulado" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Container principal ───────────────────────────────────────────────────────
type Aba = "performance" | "etapas" | "lavanderia";

// Rótulos curtos (cabem numa linha só no menu de abas, mesmo em telas
// estreitas); "Tempos por Etapa" virou "Por Etapa" só pro rótulo da aba —
// o título completo continua na página (EtapasView).
const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: "performance",  label: "Performance", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "etapas",       label: "Por Etapa",    icon: <BarChart3 className="w-4 h-4" /> },
  { id: "lavanderia",   label: "Lavanderia",   icon: <WashingMachine className="w-4 h-4" /> },
];

export default function MovimentosContainer({ isMaster, podeOperar }: { isMaster?: boolean; podeOperar: boolean }) {
  const [aba, setAba] = useState<Aba>("performance");

  return (
    <div className="space-y-4">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
        <p className="text-sm text-gray-500 mt-0.5">Análise de desempenho das camareiras</p>
      </div>

      {/* Menu de abas — overflow-x-auto + whitespace-nowrap: em telas estreitas
          os botões mantêm o tamanho natural (sem quebrar o texto em várias
          linhas) e a barra rola horizontalmente se não couber tudo. O ícone
          some abaixo do breakpoint sm: economiza espaço suficiente pra caber
          as 3 abas sem precisar rolar (era o que cortava "Lavanderia"). */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
              aba === a.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="hidden sm:inline-flex">{a.icon}</span>
            {a.label}
          </button>
        ))}
        {/* Respiro no fim da barra — sem isso o último botão fica colado na
            borda da tela quando rolado até o fim, em telas estreitas. */}
        <div className="shrink-0 w-1" aria-hidden="true" />
      </div>

      {/* Conteúdo */}
      {aba === "performance"  && <PerformanceView isMaster={isMaster} podeOperar={podeOperar} />}
      {aba === "etapas"       && <EtapasView />}
      {aba === "lavanderia"   && <LavandariaView />}
    </div>
  );
}
