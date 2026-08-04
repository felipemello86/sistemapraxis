'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import { AreaChart, Area, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Panel, StatCard } from '@/components/ui-kit'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Maximize2,
  Minimize2,
  Siren,
  TrendingUp,
  Flag,
} from 'lucide-react'
import type { DailyCommitmentView } from '@/lib/types'

// Tela "Performance" — lista de relatórios diários do Kanban de Execução +
// gráfico de % de realização do dia, visualmente igual ao gráfico
// "Conformidade ao longo do tempo" da Evolução (mesmo componente/estilo,
// pedido explícito). Um relatório = um MaintenanceDailyCommitment (um por
// dia, criado ao "fechar a programação do dia").

// Janela do gráfico "Capacidade Produtiva" — 30 dias (1 mês), reduzida dos
// 90 dias (3 meses) originais a pedido do Felipe; não precisa mais bater com
// DIAS_JANELA de components/views/evolucao.tsx (que continua em 90). Card
// compacto mostra só os últimos DIAS_COMPACTO_CAPACIDADE dias; o botão de
// expandir (mesmo padrão de Evolução) revela a janela inteira de
// DIAS_JANELA_CAPACIDADE.
const DIAS_JANELA_CAPACIDADE = 30
const DIAS_COMPACTO_CAPACIDADE = 7

// Pedido explícito do Felipe: cada dia do gráfico de Capacidade Produtiva
// passou a ser a MÉDIA MÓVEL do próprio dia + os 6 anteriores (janela de 7),
// não mais a contagem bruta daquele dia isolado — suaviza picos de um único
// dia ruidoso. Coincide numericamente com DIAS_COMPACTO_CAPACIDADE (7), mas
// são conceitos independentes: um é o tamanho da janela de suavização, o
// outro é quantos pontos já suavizados aparecem no card compacto.
const JANELA_MEDIA_MOVEL_CAPACIDADE = 7

function formatarDiaMes(data: string) {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

function formatarHora(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

// Mesmo critério de "dia local" de isoLocal em evolucao.tsx — usa
// getFullYear/getMonth/getDate (hora do NAVEGADOR, não toISOString/UTC) pra
// não empurrar um evento perto da meia-noite pro dia errado. Só serve pra
// bucketizar aqui dentro; não precisa bater com nenhum formato salvo no banco.
function chaveDiaLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Arredonda pra 1 casa decimal — a média móvel deixa de ser um número
// inteiro (ex.: 2.3 NC/dia), diferente da contagem bruta de antes.
function arredondar1(n: number) {
  return Math.round(n * 10) / 10
}

// Verde (positivo: mais NC eliminadas que surgidas no dia) / vermelho
// (negativo) — mesmos tons de corPorScore em evolucao.tsx (green-500/red-500),
// aqui sem interpolação: é uma decisão binária por dia, não uma escala
// contínua.
const VERDE_CAPACIDADE = 'rgb(34, 197, 94)'
const VERMELHO_CAPACIDADE = 'rgb(239, 68, 68)'

// Config do ChartContainer — mesmo objeto usado nos dois modos (compacto e
// expandido), então fica declarado uma vez só fora do componente. Uma única
// série agora (pedido explícito do Felipe: "o gráfico deve ser apenas uma
// linha") — a cor real de cada trecho vem do gradiente horizontal aplicado
// no stroke/fill, não desse `color` (que só serve de fallback/legenda).
const CAPACIDADE_CHART_CONFIG = {
  diferenca: { label: 'Diferença (eliminadas − surgidas)', color: 'var(--foreground)' },
}

type PontoCapacidade = {
  dia: string
  diferenca: number
  ncEliminadas: number
  ncSurgidas: number
  positivo: boolean
}

// Tooltip dedicado do gráfico de Capacidade — o ChartTooltipContent genérico
// (components/ui/chart.tsx) só mostrava "-4,3" pro saldo, e o Felipe leu
// isso como dois números (-4 e 3) em vez de um decimal só (vírgula é
// separador decimal em pt-BR). Aqui o tooltip abre a conta: eliminadas,
// surgidas e o saldo já com sinal explícito — sem ambiguidade nenhuma.
function TooltipCapacidade({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: PontoCapacidade }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const sinal = p.diferenca > 0 ? '+' : ''
  const corSaldo = p.positivo ? VERDE_CAPACIDADE : VERMELHO_CAPACIDADE
  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <div className="grid min-w-44 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{p.dia}</div>
      <div className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>NC eliminadas/dia</span>
        <span className="font-mono tabular-nums text-foreground">{fmt(p.ncEliminadas)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>NC surgidas/dia</span>
        <span className="font-mono tabular-nums text-foreground">{fmt(p.ncSurgidas)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4 border-t pt-1">
        <span className="text-muted-foreground">Saldo</span>
        <span className="font-mono font-semibold tabular-nums" style={{ color: corSaldo }}>
          {sinal}{fmt(p.diferenca)}
        </span>
      </div>
    </div>
  )
}

// Stops do gradiente horizontal da linha — um por ponto da série recebida,
// verde quando aquele dia eliminou mais NC do que surgiu, vermelho caso
// contrário (pedido explícito do Felipe). Mesma técnica de stopsGradiente em
// evolucao.tsx, só que com 2 cores fixas em vez de interpolação contínua.
// Função solta (não hook) porque é chamada com séries diferentes (compacta
// de 7 dias vs. expandida de 90) a partir de dois useMemo separados abaixo.
function calcularStopsCapacidade(dados: PontoCapacidade[]) {
  const n = dados.length
  if (n === 0) return []
  return dados.map((d, i) => ({
    offset: `${(i / Math.max(n - 1, 1)) * 100}%`,
    cor: d.positivo ? VERDE_CAPACIDADE : VERMELHO_CAPACIDADE,
  }))
}

// Denominador é totalPrevisto (congelado no fechamento do dia), não o total
// ao vivo de commitment.cards — cards intempestivos/urgentes adicionados
// depois (previsto=false) só entram no numerador se executados, podendo
// levar o % acima de 100% (pedido explícito: 10 previstos + 1 não previsto
// executado = 110%). Ver mesma lógica em dailyReport.ts.
function pctRealizacao(commitment: DailyCommitmentView) {
  if (commitment.totalPrevisto === 0) return 0
  const executadas = commitment.cards.filter((c) => c.executionStatus === 'EXECUTADA').length
  return Math.round((executadas / commitment.totalPrevisto) * 100)
}

export function Performance({
  commitments,
  ncSurgidasEm,
  ncEliminadasEm,
}: {
  commitments: DailyCommitmentView[]
  // Timestamps ISO crus (ver comentário completo em components/dashboard.tsx)
  // — bucketizados por dia aqui dentro, mesmo padrão de serieDiaria em
  // evolucao.tsx.
  ncSurgidasEm: string[]
  ncEliminadasEm: string[]
}) {
  // commitments chega ordenado do mais recente pro mais antigo (page.tsx) —
  // aqui inverte só pro gráfico, que precisa do mais antigo à esquerda.
  const serieDiaria = useMemo(
    () =>
      [...commitments]
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((c) => ({ dia: formatarDiaMes(c.data), realizacao: pctRealizacao(c) })),
    [commitments],
  )

  // "Capacidade Produtiva" — NC surgidas vs eliminadas por dia, últimos
  // DIAS_JANELA_CAPACIDADE dias corridos (não amarrado a dia com
  // MaintenanceDailyCommitment fechado, diferente de serieDiaria acima).
  // Cada dia exibido é a MÉDIA MÓVEL de JANELA_MEDIA_MOVEL_CAPACIDADE dias
  // (o próprio dia + os 6 anteriores) — pedido explícito do Felipe, pra
  // suavizar picos de um único dia ruidoso. `diferenca` é o saldo do dia
  // (eliminadas − surgidas, já sobre as médias móveis, podendo ser negativo)
  // — pedido explícito: "o gráfico deve ser apenas uma linha, q deve ser a
  // subtração entre as NCs eliminadas e as surgidas".
  const serieCapacidade = useMemo(() => {
    const surgidasPorDia = new Map<string, number>()
    for (const iso of ncSurgidasEm) {
      const chave = chaveDiaLocal(new Date(iso))
      surgidasPorDia.set(chave, (surgidasPorDia.get(chave) ?? 0) + 1)
    }
    const eliminadasPorDia = new Map<string, number>()
    for (const iso of ncEliminadasEm) {
      const chave = chaveDiaLocal(new Date(iso))
      eliminadasPorDia.set(chave, (eliminadasPorDia.get(chave) ?? 0) + 1)
    }

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    // Contagem BRUTA por dia, com folga de JANELA_MEDIA_MOVEL_CAPACIDADE-1
    // dias ANTES do início da janela exibida — sem essa folga, o primeiro
    // dia exibido não teria histórico suficiente pra uma média de 7 dias
    // completa. Array em ordem crescente (mais antigo primeiro); o page.tsx
    // já busca dados com folga extra pra cobrir isso (ver cutoffCapacidade).
    const totalComFolga = DIAS_JANELA_CAPACIDADE + JANELA_MEDIA_MOVEL_CAPACIDADE - 1
    const bruto: { data: Date; ncSurgidas: number; ncEliminadas: number }[] = []
    for (let i = totalComFolga - 1; i >= 0; i--) {
      const d = new Date(hoje)
      d.setDate(d.getDate() - i)
      const chave = chaveDiaLocal(d)
      bruto.push({
        data: d,
        ncSurgidas: surgidasPorDia.get(chave) ?? 0,
        ncEliminadas: eliminadasPorDia.get(chave) ?? 0,
      })
    }

    const dias: PontoCapacidade[] = []
    for (let p = 0; p < DIAS_JANELA_CAPACIDADE; p++) {
      const janela = bruto.slice(p, p + JANELA_MEDIA_MOVEL_CAPACIDADE)
      const diaAtual = janela[janela.length - 1].data
      const label = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(diaAtual)
      const ncSurgidas = arredondar1(janela.reduce((s, v) => s + v.ncSurgidas, 0) / janela.length)
      const ncEliminadas = arredondar1(janela.reduce((s, v) => s + v.ncEliminadas, 0) / janela.length)
      dias.push({
        dia: label,
        diferenca: arredondar1(ncEliminadas - ncSurgidas),
        ncEliminadas,
        ncSurgidas,
        positivo: ncEliminadas >= ncSurgidas,
      })
    }
    return dias
  }, [ncSurgidasEm, ncEliminadasEm])

  // Card compacto: só os últimos DIAS_COMPACTO_CAPACIDADE dias (pedido
  // explícito do Felipe). Modo expandido (botão de maximizar, mesmo padrão
  // de Evolução): janela inteira de DIAS_JANELA_CAPACIDADE dias, com rótulos
  // do eixo X pulando pra caber sem rolagem (mesma conta de
  // intervaloExpandido em evolucao.tsx).
  const serieCapacidadeCompacta = useMemo(
    () => serieCapacidade.slice(-DIAS_COMPACTO_CAPACIDADE),
    [serieCapacidade],
  )
  const intervaloExpandidoCapacidade = Math.max(0, Math.ceil(serieCapacidade.length / 15) - 1)
  const stopsCapacidadeCompacta = useMemo(
    () => calcularStopsCapacidade(serieCapacidadeCompacta),
    [serieCapacidadeCompacta],
  )
  const stopsCapacidadeExpandida = useMemo(() => calcularStopsCapacidade(serieCapacidade), [serieCapacidade])

  const [expandidoCapacidade, setExpandidoCapacidade] = useState(false)
  useEffect(() => {
    if (!expandidoCapacidade) return
    const bodyOverflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpandidoCapacidade(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = bodyOverflowAnterior
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [expandidoCapacidade])

  // Conteúdo do gráfico em si — extraído numa função (mesmo padrão de
  // renderGraficoConformidade em evolucao.tsx) pra não duplicar o AreaChart
  // inteiro entre o card compacto e o overlay expandido; só um dos dois fica
  // montado por vez, então reaproveitar o mesmo id de <linearGradient> nos
  // dois não gera ambiguidade. Uma única série (diferenca), colorida por
  // segmento via gradiente horizontal (verde/vermelho conforme o sinal do
  // dia) — pedido explícito: "o gráfico deve ser apenas uma linha... deve
  // variar de cor conforme o resultado". baseValue={0} faz a área preencher
  // a partir do zero (não da base do eixo), já que diferenca pode ser
  // negativa; ReferenceLine em y=0 ancora visualmente o positivo/negativo.
  function renderGraficoCapacidade(dados: PontoCapacidade[], interval: number, stops: { offset: string; cor: string }[]) {
    return (
      <AreaChart data={dados} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
        <defs>
          <linearGradient id="fillCapacidade" x1="0" y1="0" x2="1" y2="0">
            {stops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.cor} stopOpacity={0.3} />
            ))}
          </linearGradient>
          <linearGradient id="strokeCapacidade" x1="0" y1="0" x2="1" y2="0">
            {stops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.cor} stopOpacity={1} />
            ))}
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="dia"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={interval}
          angle={-45}
          textAnchor="end"
          height={50}
          tick={{ fontSize: 11 }}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <ChartTooltip content={<TooltipCapacidade />} />
        <Area
          dataKey="diferenca"
          type="monotone"
          baseValue={0}
          stroke="url(#strokeCapacidade)"
          fill="url(#fillCapacidade)"
          strokeWidth={2.5}
          isAnimationActive={false}
        />
      </AreaChart>
    )
  }

  const temDadosCapacidade = ncSurgidasEm.length > 0 || ncEliminadasEm.length > 0

  const mediaRealizacao = useMemo(() => {
    if (commitments.length === 0) return 0
    const soma = commitments.reduce((s, c) => s + pctRealizacao(c), 0)
    return Math.round(soma / commitments.length)
  }, [commitments])

  const totalExecutadas = useMemo(
    () => commitments.reduce((s, c) => s + c.cards.filter((x) => x.executionStatus === 'EXECUTADA').length, 0),
    [commitments],
  )

  const larguraGrafico = Math.max(serieDiaria.length * 44, 600)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [serieDiaria])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold tracking-tight">Performance</h1>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Realização média diária"
          value={`${mediaRealizacao}%`}
          hint={`${commitments.length} ${commitments.length === 1 ? 'dia fechado' : 'dias fechados'}`}
          tone="primary"
          icon={<TrendingUp className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Itens executados no total"
          value={totalExecutadas}
          tone="success"
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        />
      </div>

      {!expandidoCapacidade ? (
        <Panel
          title="Capacidade Produtiva"
          description={`Saldo diário (NC eliminadas − surgidas), média móvel de ${JANELA_MEDIA_MOVEL_CAPACIDADE} dias, últimos ${DIAS_COMPACTO_CAPACIDADE} dias. Verde = saldo positivo; vermelha = negativo.`}
          action={
            !temDadosCapacidade ? undefined : (
              <button
                type="button"
                onClick={() => setExpandidoCapacidade(true)}
                title="Expandir gráfico (1 mês)"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )
          }
        >
          {!temDadosCapacidade ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma não conformidade registrada ou resolvida ainda.
            </p>
          ) : (
            <ChartContainer config={CAPACIDADE_CHART_CONFIG} className="h-72 w-full">
              {renderGraficoCapacidade(serieCapacidadeCompacta, 0, stopsCapacidadeCompacta)}
            </ChartContainer>
          )}
        </Panel>
      ) : (
        // Só um dos dois (compacto OU expandido) fica montado por vez — ver
        // mesmo comentário/motivo em evolucao.tsx (duplicar o <linearGradient>
        // reaproveitado nos dois ao mesmo tempo deixaria o id ambíguo).
        <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 md:p-6">
          <Panel
            title="Capacidade Produtiva"
            description={`Saldo diário (NC eliminadas − surgidas), média móvel de ${JANELA_MEDIA_MOVEL_CAPACIDADE} dias, últimos ${DIAS_JANELA_CAPACIDADE} dias (1 mês), janela inteira visível abaixo.`}
            action={
              <button
                type="button"
                onClick={() => setExpandidoCapacidade(false)}
                title="Reduzir gráfico (Esc)"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            }
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1">
              <ChartContainer config={CAPACIDADE_CHART_CONFIG} className="h-full w-full">
                {renderGraficoCapacidade(serieCapacidade, intervaloExpandidoCapacidade, stopsCapacidadeExpandida)}
              </ChartContainer>
            </div>
          </Panel>
        </div>
      )}

      <Panel
        title="Performance ao longo do tempo"
        description="Percentual de realização do Kanban de Execução por dia. Arraste pros lados pra ver os outros dias."
      >
        {serieDiaria.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma programação diária fechada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto" ref={scrollRef}>
            <div style={{ minWidth: larguraGrafico }}>
              <ChartContainer
                config={{ realizacao: { label: 'Realização', color: 'var(--chart-2)' } }}
                className="h-72 w-full"
              >
                <AreaChart data={serieDiaria} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                  <defs>
                    <linearGradient id="fillRealizacao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-realizacao)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-realizacao)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="dia"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="realizacao"
                    type="monotone"
                    stroke="var(--color-realizacao)"
                    fill="url(#fillRealizacao)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </Panel>

      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">Relatórios diários</p>
        {commitments.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">
            Nenhum relatório ainda — feche a programação do dia no Kanban de Execução pra gerar o primeiro.
          </p>
        )}
        {commitments.map((c) => {
          const executadas = c.cards.filter((x) => x.executionStatus === 'EXECUTADA')
          const pendentes = c.cards.filter((x) => x.executionStatus !== 'EXECUTADA')
          const pct = pctRealizacao(c)
          return (
            <Panel key={c.id} title={formatarDiaMes(c.data)} description={c.closedByName ? `Fechado por ${c.closedByName}` : undefined}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Realização do dia" value={`${pct}%`} size="compact" tone="primary" />
                  <StatCard
                    label="Conformidade antes"
                    value={c.conformidadeAntes !== null ? `${c.conformidadeAntes}%` : '—'}
                    size="compact"
                  />
                  <StatCard
                    label="Conformidade depois"
                    value={c.conformidadeDepois !== null ? `${c.conformidadeDepois}%` : '—'}
                    size="compact"
                    tone="success"
                  />
                  <StatCard
                    label="Cards planejados"
                    value={c.totalPrevisto}
                    hint={c.cards.length > c.totalPrevisto ? `+${c.cards.length - c.totalPrevisto} não previsto(s)` : undefined}
                    size="compact"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Cards executados ({executadas.length})
                    </p>
                    {executadas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum ainda.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {executadas.map((card) => (
                          <li key={card.id} className="flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-1.5 text-sm">
                            <span className="flex items-center gap-1.5">
                              Unidade {card.uhName} — {card.checklistItemName ?? 'item'}
                              {!card.previsto && (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                  Imprevisto
                                </span>
                              )}
                            </span>
                            {card.executedAt && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatarHora(card.executedAt)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Cards pendentes ({pendentes.length})
                    </p>
                    {pendentes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum — dia 100% realizado.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {pendentes.map((card) => (
                          <li key={card.id} className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-sm">
                            Unidade {card.uhName} — {card.checklistItemName ?? 'item'}
                            {!card.previsto && (
                              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                Imprevisto
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />
                    Não-conformidades identificadas no dia ({c.naoConformidadesIdentificadas.length})
                  </p>
                  {c.naoConformidadesIdentificadas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma identificada nesse dia.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {c.naoConformidadesIdentificadas.map((item) => (
                        <li
                          key={item.id}
                          className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                            item.urgente
                              ? 'border-destructive/40 bg-destructive/10'
                              : 'border-[var(--warning)]/30 bg-[var(--warning)]/8'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              Unidade {item.uhName} — {item.checklistItemName ?? 'item'}
                              {item.urgente && (
                                <span className="flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                  <Siren className="h-2.5 w-2.5" />
                                  Urgente
                                </span>
                              )}
                              {item.prioridade && (
                                <span className="flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">
                                  <Flag className="h-2.5 w-2.5" />
                                  Prioridade
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatarHora(item.createdAt)}
                            </span>
                          </div>
                          {item.comment && <p className="mt-0.5 text-xs text-muted-foreground">{item.comment}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />
                    Inspeções em atraso{c.uhsEmAtraso ? ` (${c.uhsEmAtraso.length})` : ''}
                  </p>
                  {c.uhsEmAtraso === null ? (
                    <p className="text-sm text-muted-foreground">Relatório ainda não enviado.</p>
                  ) : c.uhsEmAtraso.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma UH em atraso nesse dia.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {c.uhsEmAtraso.map((u) => (
                        <li
                          key={u.uhNumero}
                          className="flex items-center justify-between rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/8 px-2.5 py-1.5 text-sm"
                        >
                          <span>Unidade {u.uhNumero}</span>
                          <span className="text-xs text-muted-foreground">
                            {u.dias === null ? 'Nunca inspecionada' : `${u.dias} dias`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
