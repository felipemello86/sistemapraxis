"use client";

// "Linha do tempo" da camareira — pedido explícito do Felipe (04/08/2026) na
// tela Performance: mostrar, num eixo do horário do dia, a liberação da
// primeira UH até a finalização da última, com uma tag por UH (número +
// pontuação) e o tempo entre uma UH e outra (deslocamento OU tempo de
// limpeza). Só faz sentido no período "Hoje" — em "Este mês"/"All
// time"/"Período" os horários misturariam dias diferentes no mesmo eixo.
//
// Cores reaproveitadas do gráfico "Tempo Real" (BurndownChart.tsx,
// TIPO_COR): azul (#3b82f6) é a cor de "Liberação" lá, usada aqui pra
// identificar a tag da UH; roxo (#8b5cf6) é "Término limpeza", usado aqui
// pro trecho da barra em que ela está de fato limpando; laranja (#f59e0b) é
// "Início limpeza", usado aqui pros vãos entre UHs (deslocamento/espera).
//
// Não usa o "relógio de disponibilidade" (duracaoEfetivaSegundos, ver
// api/scores/route.ts) — a linha do tempo mostra os horários REAIS
// (liberadaEm/iniciadaEm/finalizadaEm), não a âncora usada pro cálculo do
// score. As duas coisas podem divergir de propósito (é exatamente esse
// "tempo de espera antes de apertar iniciar" que a linha do tempo também
// deixa visível, através do vão laranja antes da 1ª UH ou entre UHs).
const COR_TAG = "#3b82f6";
const COR_LIMPEZA = "#8b5cf6";
const COR_DESLOCAMENTO = "#f59e0b";

type DetalheUHTimeline = {
  sessaoId: string;
  uhNumero: string;
  score: number;
  excluidoDoScore: boolean;
  multiplaCamareira?: boolean;
  liberadaEm: string | null;
  iniciadaEm: string;
  finalizadaEm: string;
};

type SegmentoLimpeza = {
  tipo: "limpeza";
  sessaoId: string;
  inicio: number;
  fim: number;
  uhNumero: string;
  score: number;
  excluido: boolean;
};
type SegmentoVao = { tipo: "vao"; inicio: number; fim: number };
type Segmento = SegmentoLimpeza | SegmentoVao;

function formatarHora(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Formato curto pro rótulo dentro da linha do tempo (espaço é pouco) —
// diferente de formatarTempo (lib/scoring.ts), que usa "M:SS" pra exibir
// duração de uma UH isolada na lista.
function formatarDuracaoCurta(segundosTotais: number) {
  const seg = Math.max(0, Math.round(segundosTotais));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

export default function CamareiraTimeline({ detalhes }: { detalhes: DetalheUHTimeline[] }) {
  const validos = detalhes
    .filter((d) => d.iniciadaEm && d.finalizadaEm)
    .map((d) => ({
      ...d,
      iniciadaMs: new Date(d.iniciadaEm).getTime(),
      finalizadaMs: new Date(d.finalizadaEm).getTime(),
      liberadaMs: d.liberadaEm ? new Date(d.liberadaEm).getTime() : null,
    }))
    .sort((a, b) => a.iniciadaMs - b.iniciadaMs);

  if (validos.length === 0) return null;

  // Início do eixo = liberação da 1ª UH do dia (pedido explícito). Sem
  // liberadaEm registrada (não deveria acontecer, mas o campo é opcional),
  // cai pro início da própria limpeza — melhor que quebrar a tela.
  const inicioEixo = validos[0].liberadaMs ?? validos[0].iniciadaMs;
  const fimEixo = validos[validos.length - 1].finalizadaMs;
  if (fimEixo <= inicioEixo) return null;
  const span = fimEixo - inicioEixo;
  const pct = (ms: number) => ((ms - inicioEixo) / span) * 100;

  // Monta a sequência alternada vão→limpeza→vão→limpeza... Vão antes da 1ª
  // UH = espera entre liberação e início (ainda não é "deslocamento" no
  // sentido formal do card "Tempo médio de deslocamento", mas visualmente é
  // o mesmo tipo de tempo morto). Vãos entre UHs = mesma definição de
  // "deslocamento" usada em api/burndown/route.ts (finalizadaEm[N] até
  // iniciadaEm[N+1]).
  const segmentos: Segmento[] = [];
  let fimAnterior = inicioEixo;
  for (const v of validos) {
    if (v.iniciadaMs > fimAnterior) {
      segmentos.push({ tipo: "vao", inicio: fimAnterior, fim: v.iniciadaMs });
    }
    segmentos.push({
      tipo: "limpeza",
      sessaoId: v.sessaoId,
      inicio: v.iniciadaMs,
      fim: v.finalizadaMs,
      uhNumero: v.uhNumero,
      score: v.score,
      excluido: v.excluidoDoScore || !!v.multiplaCamareira,
    });
    fimAnterior = v.finalizadaMs;
  }

  // Marcações de hora cheia dentro do intervalo — eixo "abaixo da linha".
  const marcas: number[] = [];
  const primeiraHoraCheia = new Date(inicioEixo);
  primeiraHoraCheia.setMinutes(0, 0, 0);
  if (primeiraHoraCheia.getTime() < inicioEixo) primeiraHoraCheia.setHours(primeiraHoraCheia.getHours() + 1);
  for (let t = primeiraHoraCheia.getTime(); t < fimEixo; t += 60 * 60 * 1000) {
    marcas.push(t);
  }

  // Largura mínima proporcional ao número de segmentos — evita tags/rótulos
  // colados quando a camareira processou muitas UHs no dia. Rola
  // horizontalmente em telas estreitas (mesmo padrão dos gráficos de
  // Capacidade Produtiva em apps/maintenance).
  const largura = Math.max(560, segmentos.length * 130);

  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Linha do tempo</p>
      <div className="overflow-x-auto">
        <div style={{ minWidth: largura }} className="relative pt-7 pb-1">
          {/* Tags de UH (azul) e tempo entre elas (laranja) — tudo "acima da linha". */}
          <div className="relative h-6 mb-1">
            {segmentos.map((s, i) =>
              s.tipo === "limpeza" ? (
                <div
                  key={s.sessaoId}
                  className="absolute -translate-x-1/2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-sm"
                  style={{
                    left: `${(pct(s.inicio) + pct(s.fim)) / 2}%`,
                    backgroundColor: COR_TAG,
                    opacity: s.excluido ? 0.45 : 1,
                  }}
                  title={`UH ${s.uhNumero} · ${formatarHora(s.inicio)}–${formatarHora(s.fim)}${s.excluido ? " · excluído do score" : ""}`}
                >
                  {s.uhNumero} · {s.score}pts
                </div>
              ) : (
                <div
                  key={`vao-${i}`}
                  className="absolute -translate-x-1/2 text-[10px] font-medium whitespace-nowrap"
                  style={{ left: `${(pct(s.inicio) + pct(s.fim)) / 2}%`, color: COR_DESLOCAMENTO }}
                >
                  {formatarDuracaoCurta((s.fim - s.inicio) / 1000)}
                </div>
              ),
            )}
          </div>

          {/* A linha em si — trechos roxos (limpando) e laranja (deslocamento/espera). */}
          <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
            {segmentos.map((s, i) => (
              <div
                key={i}
                className="absolute top-0 h-full"
                style={{
                  left: `${pct(s.inicio)}%`,
                  width: `${Math.max(pct(s.fim) - pct(s.inicio), 0.5)}%`,
                  backgroundColor: s.tipo === "limpeza" ? COR_LIMPEZA : COR_DESLOCAMENTO,
                  opacity: s.tipo === "limpeza" && s.excluido ? 0.45 : 1,
                }}
              />
            ))}
          </div>

          {/* Régua de horas — "abaixo da linha". */}
          <div className="relative h-4 mt-1">
            {marcas.map((t) => (
              <div
                key={t}
                className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${pct(t)}%` }}
              >
                <div className="w-px h-1.5 bg-gray-300" />
                <span className="text-[9px] text-gray-400 mt-0.5">{formatarHora(t)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
