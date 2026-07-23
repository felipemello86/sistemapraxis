'use client'

import { useMemo, useRef, useEffect } from 'react'
import { AreaChart, Area, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Panel, StatCard } from '@/components/ui-kit'
import { AlertTriangle, BarChart3, CheckCircle2, Clock, TrendingUp } from 'lucide-react'
import type { DailyCommitmentView } from '@/lib/types'

// Tela "Performance" — lista de relatórios diários do Kanban de Execução +
// gráfico de % de realização do dia, visualmente igual ao gráfico
// "Conformidade ao longo do tempo" da Evolução (mesmo componente/estilo,
// pedido explícito). Um relatório = um MaintenanceDailyCommitment (um por
// dia, criado ao "fechar a programação do dia").

function formatarDiaMes(data: string) {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

function formatarHora(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function pctRealizacao(commitment: DailyCommitmentView) {
  if (commitment.cards.length === 0) return 0
  const executadas = commitment.cards.filter((c) => c.executionStatus === 'EXECUTADA').length
  return Math.round((executadas / commitment.cards.length) * 100)
}

export function Performance({ commitments }: { commitments: DailyCommitmentView[] }) {
  // commitments chega ordenado do mais recente pro mais antigo (page.tsx) —
  // aqui inverte só pro gráfico, que precisa do mais antigo à esquerda.
  const serieDiaria = useMemo(
    () =>
      [...commitments]
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((c) => ({ dia: formatarDiaMes(c.data), realizacao: pctRealizacao(c) })),
    [commitments],
  )

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
                  <StatCard label="Cards planejados" value={c.cards.length} size="compact" />
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
                            <span>
                              Unidade {card.uhName} — {card.checklistItemName ?? 'item'}
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
                          <li key={card.id} className="rounded-lg border border-border/70 px-2.5 py-1.5 text-sm">
                            Unidade {card.uhName} — {card.checklistItemName ?? 'item'}
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
                          className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/8 px-2.5 py-1.5 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              Unidade {item.uhName} — {item.checklistItemName ?? 'item'}
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
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
