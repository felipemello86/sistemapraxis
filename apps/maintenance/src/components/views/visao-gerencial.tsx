'use client'

import { useMemo } from 'react'
import {
  Building2,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { StatCard, Panel } from '@/components/ui-kit'
import { Badge } from '@/components/ui/badge'
import {
  corCategoria,
  contarConformidade,
  formatarData,
  labelResultado,
  temPendencia,
  ultimaInspecaoPorUnidade,
} from '@/lib/domain'
import type {
  InspecaoComUnidade,
  ChecklistItem,
  UnitOption,
} from '@/lib/types'

export function VisaoGerencial({
  unidades,
  itens,
  inspecoes,
  meta,
}: {
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  meta: number
}) {
  const totalUnidades = unidades.length
  const totalInspecoes = inspecoes.length
  const comPendencias = inspecoes.filter(temPendencia).length
  const ultimaMap = useMemo(
    () => ultimaInspecaoPorUnidade(inspecoes),
    [inspecoes],
  )
  const inspecionadas = ultimaMap.size
  const cobertura =
    totalUnidades > 0 ? Math.round((inspecionadas / totalUnidades) * 100) : 0

  // Conformidade geral — baseada na última inspeção de cada UH (mesmo
  // critério do "goal" do protótipo standalone: bate contra a meta
  // configurável em Configurações > Prazo & Meta).
  const conformidade = useMemo(() => {
    const ultimas = Array.from(ultimaMap.values())
    if (ultimas.length === 0) return null
    const contagens = ultimas.map(contarConformidade)
    const ok = contagens.reduce((s, c) => s + c.ok, 0)
    const total = contagens.reduce((s, c) => s + c.total, 0)
    return total > 0 ? Math.round((ok / total) * 100) : null
  }, [ultimaMap])

  // Distribuição por categoria de itens
  const porCategoria = useMemo(() => {
    const counts = new Map<string, number>()
    for (const it of itens) {
      counts.set(it.category, (counts.get(it.category) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([categoria, total]) => ({
      categoria,
      total,
      fill: corCategoria(categoria),
    }))
  }, [itens])

  // Inspeções por mês (últimos 6 meses)
  const porMes = useMemo(() => {
    const meses: { mes: string; ok: number; problema: number }[] = []
    const agora = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
      const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d)
      const doMes = inspecoes.filter((insp) => {
        const di = new Date(insp.date)
        return (
          di.getMonth() === d.getMonth() &&
          di.getFullYear() === d.getFullYear()
        )
      })
      const contagens = doMes.map(contarConformidade)
      meses.push({
        mes: label,
        ok: contagens.reduce((s, x) => s + x.ok, 0),
        problema: contagens.reduce((s, x) => s + x.problema, 0),
      })
    }
    return meses
  }, [inspecoes])

  const recentes = inspecoes.slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Unidades"
          value={totalUnidades}
          hint={`${inspecionadas} já inspecionadas`}
          tone="primary"
          icon={<Building2 className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Cobertura"
          value={`${cobertura}%`}
          hint="das unidades cobertas"
          tone="success"
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Inspeções"
          value={totalInspecoes}
          hint="realizadas no total"
          tone="default"
          icon={<ClipboardCheck className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Com pendências"
          value={comPendencias}
          hint="exigem ação"
          tone="warning"
          icon={<AlertTriangle className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Conformidade"
          value={conformidade === null ? '—' : `${conformidade}%`}
          hint={`meta: ${meta}%`}
          tone={conformidade !== null && conformidade >= meta ? 'success' : 'warning'}
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Inspeções por mês"
          description="Itens avaliados nos últimos 6 meses"
          className="lg:col-span-2"
        >
          <ChartContainer
            config={{
              ok: { label: 'Conformes', color: 'var(--chart-2)' },
              problema: { label: 'Pendências', color: 'var(--chart-4)' },
            }}
            className="h-64 w-full"
          >
            <BarChart data={porMes} barGap={4}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="ok" fill="var(--color-ok)" radius={[6, 6, 0, 0]} />
              <Bar
                dataKey="problema"
                fill="var(--color-problema)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </Panel>

        <Panel
          title="Itens por categoria"
          description="Catálogo de inspeção"
        >
          <ChartContainer config={{}} className="mx-auto h-64 w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="categoria" />} />
              <Pie
                data={porCategoria}
                dataKey="total"
                nameKey="categoria"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
              >
                {porCategoria.map((entry) => (
                  <Cell key={entry.categoria} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {porCategoria.map((c) => (
              <div key={c.categoria} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.fill }}
                />
                <span className="text-muted-foreground">{c.categoria}</span>
                <span className="ml-auto font-medium">{c.total}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Inspeções recentes" description="Últimos registros">
        {recentes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma inspeção registrada ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {recentes.map((insp) => (
              <li
                key={insp.id}
                className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground">
                  {insp.unit.name.slice(0, 2) || '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    Unidade {insp.unit.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {insp.inspector?.name ?? 'Inspetor não informado'} ·{' '}
                    {formatarData(insp.date)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    temPendencia(insp)
                      ? 'border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]'
                      : 'border-[var(--success)]/30 bg-[var(--success)]/12 text-[var(--success)]'
                  }
                >
                  {labelResultado(insp)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
