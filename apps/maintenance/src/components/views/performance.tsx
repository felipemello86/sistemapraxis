'use client'

import { useMemo, useRef, useEffect } from 'react'
import { AreaChart, ComposedChart, Area, Line, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Panel, StatCard } from '@/components/ui-kit'
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Siren, TrendingUp } from 'lucide-react'
import type { DailyCommitmentView } from '@/lib/types'

// Tela "Performance" — lista de relatórios diários do Kanban de Execução +
// gráfico de % de realização do dia, visualmente igual ao gráfico
// "Conformidade ao longo do tempo" da Evolução (mesmo componente/estilo,
// pedido explícito). Um relatório = um MaintenanceDailyCommitment (um por
// dia, criado ao "fechar a programação do dia").

// Janela do gráfico "Capacidade Produtiva" — mesma largura (90 dias) usada
// em components/views/evolucao.tsx (DIAS_JANELA), pra consistência entre os
// gráficos diários do módulo.
const DIAS_JANELA_CAPACIDADE = 90

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

// Verde (positivo: mais NC eliminadas que surgidas no dia) / vermelho
// (negativo) — mesmos tons de corPorScore em evolucao.tsx (green-500/red-500),
// aqui sem interpolação: é uma decisão binária por dia, não uma escala
// contínua.
const VERDE_BANDA = 'rgb(34, 197, 94)'
const VERMELHO_BANDA = 'rgb(239, 68, 68)'

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
  // minValor/diffValor formam a "banda" empilhada (Area stackId) que
  // preenche visualmente a região entre as duas linhas — minValor fica
  // transparente (só empurra a base), diffValor é a parte colorida em cima.
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
    const dias: {
      dia: string
      ncSurgidas: number
      ncEliminadas: number
      minValor: number
      diffValor: number
      positivo: boolean
    }[] = []
    for (let i = DIAS_JANELA_CAPACIDADE - 1; i >= 0; i--) {
      const d = new Date(hoje)
      d.setDate(d.getDate() - i)
      const chave = chaveDiaLocal(d)
      const label = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d)
      const ncSurgidas = surgidasPorDia.get(chave) ?? 0
      const ncEliminadas = eliminadasPorDia.get(chave) ?? 0
      dias.push({
        dia: label,
        ncSurgidas,
        ncEliminadas,
        minValor: Math.min(ncSurgidas, ncEliminadas),
        diffValor: Math.abs(ncEliminadas - ncSurgidas),
        positivo: ncEliminadas >= ncSurgidas,
      })
    }
    return dias
  }, [ncSurgidasEm, ncEliminadasEm])

  // Stops do gradiente horizontal da banda — um por dia, verde quando aquele
  // dia eliminou mais NC do que surgiu, vermelho caso contrário (pedido
  // explícito do Felipe). Mesma técnica de stopsGradiente em evolucao.tsx,
  // só que com 2 cores fixas em vez de interpolação contínua.
  const stopsBanda = useMemo(() => {
    const n = serieCapacidade.length
    if (n === 0) return []
    return serieCapacidade.map((d, i) => ({
      offset: `${(i / Math.max(n - 1, 1)) * 100}%`,
      cor: d.positivo ? VERDE_BANDA : VERMELHO_BANDA,
    }))
  }, [serieCapacidade])

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

  const larguraGraficoCapacidade = Math.max(serieCapacidade.length * 44, 600)
  const scrollCapacidadeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollCapacidadeRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [serieCapacidade])

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

      <Panel
        title="Capacidade Produtiva"
        description="NC eliminadas vs. NC surgidas por dia. Área verde = eliminação maior que surgimento; vermelha = o contrário. Arraste pros lados pra ver os outros dias."
      >
        {!temDadosCapacidade ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma não conformidade registrada ou resolvida ainda.
          </p>
        ) : (
          <div className="overflow-x-auto" ref={scrollCapacidadeRef}>
            <div style={{ minWidth: larguraGraficoCapacidade }}>
              <ChartContainer
                config={{
                  ncSurgidas: { label: 'NC surgidas', color: 'var(--destructive)' },
                  ncEliminadas: { label: 'NC eliminadas', color: 'var(--success)' },
                }}
                className="h-72 w-full"
              >
                <ComposedChart data={serieCapacidade} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                  <defs>
                    {/* Gradiente HORIZONTAL (um stop por dia) — verde/vermelho
                        conforme quem está por cima naquele dia (positivo em
                        serieCapacidade). Mesma técnica do gradiente por score
                        em evolucao.tsx, só que binária. */}
                    <linearGradient id="fillBandaCapacidade" x1="0" y1="0" x2="1" y2="0">
                      {stopsBanda.map((s, i) => (
                        <stop key={i} offset={s.offset} stopColor={s.cor} stopOpacity={0.3} />
                      ))}
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
                  <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {/* Banda entre as duas linhas: minValor (transparente, só
                      empurra a base) + diffValor (colorido, empilhado em
                      cima) — junto preenchem exatamente a região entre
                      ncSurgidas e ncEliminadas naquele dia. tooltipType="none"
                      nas duas pra não aparecerem no tooltip (são só suporte
                      visual da banda, não métricas em si — ncSurgidas/
                      ncEliminadas já cobrem isso). */}
                  <Area
                    dataKey="minValor"
                    stackId="banda"
                    stroke="none"
                    fill="transparent"
                    isAnimationActive={false}
                    tooltipType="none"
                  />
                  <Area
                    dataKey="diffValor"
                    stackId="banda"
                    stroke="none"
                    fill="url(#fillBandaCapacidade)"
                    isAnimationActive={false}
                    tooltipType="none"
                  />
                  <Line
                    dataKey="ncSurgidas"
                    type="monotone"
                    stroke="var(--color-ncSurgidas)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="ncEliminadas"
                    type="monotone"
                    stroke="var(--color-ncEliminadas)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </Panel>

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
                                  Não previsto
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
                                Não previsto
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
