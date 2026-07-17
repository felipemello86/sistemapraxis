'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Panel, StatCard } from '@/components/ui-kit'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { contarConformidade } from '@/lib/domain'
import type { InspecaoComUnidade } from '@/lib/types'

export function Evolucao({
  inspecoes,
}: {
  inspecoes: InspecaoComUnidade[]
}) {
  const serie = useMemo(() => {
    const meses: {
      mes: string
      inspecoes: number
      conformidade: number
    }[] = []
    const agora = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
      const label = new Intl.DateTimeFormat('pt-BR', {
        month: 'short',
      }).format(d)
      const doMes = inspecoes.filter((insp) => {
        const di = new Date(insp.date)
        return (
          di.getMonth() === d.getMonth() &&
          di.getFullYear() === d.getFullYear()
        )
      })
      const contagens = doMes.map(contarConformidade)
      const totalItens = contagens.reduce((s, x) => s + x.total, 0)
      const ok = contagens.reduce((s, x) => s + x.ok, 0)
      meses.push({
        mes: label,
        inspecoes: doMes.length,
        conformidade: totalItens > 0 ? Math.round((ok / totalItens) * 100) : 0,
      })
    }
    return meses
  }, [inspecoes])

  const contagensGerais = useMemo(() => inspecoes.map(contarConformidade), [inspecoes])
  const totalItens = contagensGerais.reduce((s, x) => s + x.total, 0)
  const totalOk = contagensGerais.reduce((s, x) => s + x.ok, 0)
  const conformidadeGeral =
    totalItens > 0 ? Math.round((totalOk / totalItens) * 100) : 0

  const ultimo = serie[serie.length - 1]?.conformidade ?? 0
  const penultimo = serie[serie.length - 2]?.conformidade ?? 0
  const tendencia = ultimo - penultimo

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Conformidade geral"
          value={`${conformidadeGeral}%`}
          hint="média histórica"
          tone="success"
          icon={<Activity className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Tendência mensal"
          value={`${tendencia >= 0 ? '+' : ''}${tendencia}%`}
          hint="vs. mês anterior"
          tone={tendencia >= 0 ? 'success' : 'danger'}
          icon={
            tendencia >= 0 ? (
              <TrendingUp className="h-[18px] w-[18px]" />
            ) : (
              <TrendingDown className="h-[18px] w-[18px]" />
            )
          }
        />
        <StatCard
          label="Total de itens avaliados"
          value={totalItens}
          hint="em todas as inspeções"
          tone="primary"
        />
      </div>

      <Panel
        title="Conformidade ao longo do tempo"
        description="Percentual de itens conformes por mês (12 meses)"
      >
        <ChartContainer
          config={{
            conformidade: { label: 'Conformidade', color: 'var(--chart-2)' },
          }}
          className="h-72 w-full"
        >
          <AreaChart data={serie}>
            <defs>
              <linearGradient id="fillConf" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-conformidade)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-conformidade)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={32}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="conformidade"
              type="monotone"
              stroke="var(--color-conformidade)"
              fill="url(#fillConf)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ChartContainer>
      </Panel>

      <Panel
        title="Volume de inspeções"
        description="Número de inspeções realizadas por mês"
      >
        <ChartContainer
          config={{
            inspecoes: { label: 'Inspeções', color: 'var(--chart-1)' },
          }}
          className="h-64 w-full"
        >
          <LineChart data={serie}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              dataKey="inspecoes"
              type="monotone"
              stroke="var(--color-inspecoes)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
      </Panel>
    </div>
  )
}
