"use client";

// "Linha do tempo" da camareira — pedido explícito do Felipe (04/08/2026) na
// tela Performance: mostrar, num eixo do horário do dia, do início do
// expediente até a finalização da última UH, com uma tag por UH (número +
// pontuação) e o tempo entre uma UH e outra (deslocamento OU tempo de
// limpeza). Só faz sentido no período "Hoje" — em "Este mês"/"All
// time"/"Período" os horários misturariam dias diferentes no mesmo eixo.
//
// O eixo sempre começa no início do turno configurado (ex.: 10:30), não na
// liberação da 1ª UH — pedido explícito do Felipe (04/08/2026): mesmo que a
// 1ª UH seja liberada antes desse horário, a linha deve exibir a partir do
// início do expediente.
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
//
// v1 desenhava tudo com texto horizontal e um `minWidth` proporcional ao
// número de segmentos dentro de um `overflow-x-auto` — a ideia era rolar
// horizontalmente em vez de espremer. Na prática isso estourou o card: como
// nem `.card` nem a coluna do grid tinham `min-width: 0`, o item de
// grid/flex cresceu pra caber o conteúdo em vez de conter o scroll (mesma
// pegadinha clássica de flex/grid). Pedido do Felipe (04/08/2026): o card
// tem que voltar ao tamanho antigo e a linha do tempo tem que caber dentro
// dele — sem rolagem, 100% de largura fixa. Corrigido usando posicionamento
// só em %, sem minWidth nenhum, e textos verticais (writing-mode) pros
// rótulos de vão/hora — isso reduz a largura que cada rótulo ocupa (uma
// letra de largura em vez de uma palavra inteira), diminuindo bastante a
// chance de colisão mesmo com muitas UHs no mesmo dia. A tag da UH continua
// horizontal, mas em 2 linhas empilhadas (número embaixo do score) em vez
// de uma linha só — mesma ideia de "arrumar na vertical", só que sem girar
// o texto letra a letra (ficaria alto demais pro card).
const COR_TAG = "#3b82f6";
const COR_LIMPEZA = "#8b5cf6";
const COR_DESLOCAMENTO = "#f59e0b";

type DetalheUHTimeline = {
  sessaoId: string;
  uhNumero: string;
  score: number;
  excluidoDoScore: boolean;
  multiplaCamareira?: boolean;
  data: string;
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

// Texto rotacionado 90° (letras de cima pra baixo) — usado pros rótulos de
// vão e de hora, que precisam ocupar pouquíssima largura horizontal pra não
// colidir quando as UHs estão espremidas num intervalo curto.
function TextoVertical({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={className}
      style={{ writingMode: "vertical-rl", textOrientation: "mixed", ...style }}
    >
      {children}
    </span>
  );
}

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

export default function CamareiraTimeline({
  detalhes,
  turnoInicioHora,
}: {
  detalhes: DetalheUHTimeline[];
  // Início do turno configurado (tela de Configurações, ex.: "10:30").
  // Pedido do Felipe (04/08/2026): o eixo sempre começa no início do
  // expediente, mesmo que a 1ª UH tenha sido liberada antes disso — nesse
  // caso a liberação antecipada simplesmente fica fora do eixo, igual ao
  // "piso do dia" já usado no cálculo do score (ver turnoInicioHora em
  // api/scores/route.ts).
  turnoInicioHora: string;
}) {
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

  // Início do eixo = início do turno (config), no dia da 1ª UH — não mais a
  // liberação em si. Se por algum motivo a limpeza começou antes do início
  // do turno (não deveria acontecer), usa esse horário mais cedo como piso
  // pra não gerar posições negativas no eixo.
  // Brasil não observa mais horário de verão desde 2019 — offset fixo -03:00
  // (mesma convenção de api/scores/route.ts e lib/late-checkout.ts).
  const turnoInicioMs = new Date(`${validos[0].data}T${turnoInicioHora}:00-03:00`).getTime();
  const inicioEixo = Math.min(turnoInicioMs, validos[0].iniciadaMs);
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

  // Marcações abaixo da linha — pedido do Felipe (04/08/2026): "mais
  // detalhe abaixo da linha (legendas de horários)". Passo adaptativo (15,
  // 30 ou 60 min conforme o tamanho do intervalo) em vez de sempre hora
  // cheia, pra não ficar só com 1-2 marcações num dia curto. Início e fim
  // exatos do eixo (liberação da 1ª UH / finalização da última) sempre
  // aparecem nas pontas, mesmo fora de um múltiplo redondo — são marcados
  // à parte (cor mais escura) pra se distinguir das marcações regulares, e
  // qualquer marcação regular a menos de 5 min de uma ponta é descartada
  // pra não sobrepor texto.
  const spanMin = span / 60000;
  const passoMin = spanMin > 360 ? 60 : spanMin > 120 ? 30 : 15;
  const marcasRegulares: number[] = [];
  const primeiraMarca = new Date(inicioEixo);
  const minutosArred = Math.ceil(primeiraMarca.getMinutes() / passoMin) * passoMin;
  primeiraMarca.setMinutes(minutosArred, 0, 0);
  for (let t = primeiraMarca.getTime(); t < fimEixo; t += passoMin * 60 * 1000) {
    if (Math.abs(t - inicioEixo) > 5 * 60 * 1000 && Math.abs(t - fimEixo) > 5 * 60 * 1000) {
      marcasRegulares.push(t);
    }
  }

  return (
    <div className="mb-4 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Linha do tempo</p>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COR_LIMPEZA }} />
            Tempo na UH
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COR_DESLOCAMENTO }} />
            Deslocamento
          </span>
        </div>
      </div>
      <div className="relative w-full min-w-0">
        {/* Tags de UH (azul, 3 linhas empilhadas: número / tempo na UH /
            pontuação — o tempo na UH ficou de fora da 1ª versão, pedido do
            Felipe pra incluir), alinhadas pela base. Vãos (laranja, texto
            vertical) ficam num nível ACIMA das tags, com uma linha fina
            ligando o rótulo até a barra — antes os dois disputavam a mesma
            faixa embaixo e encavalavam quando as UHs ficavam próximas
            (pedido do Felipe, 04/08/2026: "evitar de encavalar o tempo de
            deslocamento com a tag da UH"). */}
        <div className="relative h-16">
          {segmentos.map((s, i) =>
            s.tipo === "limpeza" ? (
              <div
                key={s.sessaoId}
                className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center justify-center rounded-md px-1 py-0.5 text-white leading-none shadow-sm"
                style={{
                  left: `${(pct(s.inicio) + pct(s.fim)) / 2}%`,
                  backgroundColor: COR_TAG,
                  opacity: s.excluido ? 0.45 : 1,
                }}
                title={`UH ${s.uhNumero} · ${formatarHora(s.inicio)}–${formatarHora(s.fim)}${s.excluido ? " · excluído do score" : ""}`}
              >
                <span className="text-[9px] font-bold whitespace-nowrap">{s.uhNumero}</span>
                <span className="text-[8px] whitespace-nowrap opacity-90">{formatarDuracaoCurta((s.fim - s.inicio) / 1000)}</span>
                <span className="text-[8px] whitespace-nowrap">{s.score}pts</span>
              </div>
            ) : (
              <div
                key={`vao-${i}`}
                className="absolute top-0 h-16 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${(pct(s.inicio) + pct(s.fim)) / 2}%` }}
              >
                <TextoVertical
                  className="text-[9px] font-medium whitespace-nowrap flex-shrink-0"
                  style={{ color: COR_DESLOCAMENTO }}
                >
                  {formatarDuracaoCurta((s.fim - s.inicio) / 1000)}
                </TextoVertical>
                {/* Linha fina ligando o rótulo até a barra — precisa ir até
                    embaixo de vez (pedido do Felipe, 04/08/2026: antes
                    parava na altura das tags de UH, não descia até a linha
                    do tempo em si). flex-1 estica o traço até preencher o
                    resto da altura do container (h-16, igual ao das tags),
                    que termina exatamente onde a barra começa. */}
                <div className="w-px flex-1 mt-0.5" style={{ backgroundColor: COR_DESLOCAMENTO, opacity: 0.4 }} />
              </div>
            ),
          )}
        </div>

        {/* A linha em si — trechos roxos (limpando) e laranja
            (deslocamento/espera). Largura sempre 100% do card, nunca mais. */}
        <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden w-full">
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

        {/* Régua de horas — "abaixo da linha", texto vertical também.
            Marcações regulares (passo adaptativo) em cinza claro; início e
            fim exatos do eixo em cinza escuro/negrito, sempre presentes,
            alinhados pra dentro do card nas pontas (senão o texto ficaria
            meio cortado fora da borda). */}
        <div className="relative h-9 mt-1">
          {marcasRegulares.map((t) => (
            <div
              key={t}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${pct(t)}%` }}
            >
              <div className="w-px h-1.5 bg-gray-300" />
              <TextoVertical className="text-[9px] text-gray-400 mt-0.5 leading-none">
                {formatarHora(t)}
              </TextoVertical>
            </div>
          ))}
          <div className="absolute top-0 left-0 flex flex-col items-start">
            <div className="w-px h-1.5 bg-gray-400" />
            <TextoVertical className="text-[9px] text-gray-600 font-semibold mt-0.5 leading-none">
              {formatarHora(inicioEixo)}
            </TextoVertical>
          </div>
          <div className="absolute top-0 right-0 flex flex-col items-end">
            <div className="w-px h-1.5 bg-gray-400 ml-auto" />
            <TextoVertical className="text-[9px] text-gray-600 font-semibold mt-0.5 leading-none">
              {formatarHora(fimEixo)}
            </TextoVertical>
          </div>
        </div>
      </div>
    </div>
  );
}
