'use client'

import { useEffect, useMemo, useRef } from 'react'
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
import { Activity } from 'lucide-react'
import { contarConformidade } from '@/lib/domain'
import type { InspecaoComUnidade } from '@/lib/types'

// Janela da série diária de conformidade — pedido explícito (era mensal, virou
// diária, hoje sempre na ponta direita). 30 dias é um piso razoável pra não
// virar uma tela infinita de rolagem, mas ainda mostrar uma tendência útil.
const DIAS_JANELA = 30

export function Evolucao({
  inspecoes,
}: {
  inspecoes: InspecaoComUnidade[]
}) {
  // Volume de inspeções continua mensal (não fazia parte do pedido de virar
  // diário) — usado só pelo último gráfico da tela.
  const serieMensal = useMemo(() => {
    const meses: { mes: string; inspecoes: number }[] = []
    const agora = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
      const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d)
      const doMes = inspecoes.filter((insp) => {
        const di = new Date(insp.date)
        return di.getMonth() === d.getMonth() && di.getFullYear() === d.getFullYear()
      })
      meses.push({ mes: label, inspecoes: doMes.length })
    }
    return meses
  }, [inspecoes])

  // Conformidade ao longo do tempo — NÃO é "conformidade das inspeções feitas
  // naquele dia" (isso derrubava o gráfico pra 0% em qualquer dia sem
  // inspeção nova, mesmo com a conformidade geral em 91%). É o estado
  // ACUMULADO da conformidade geral até aquele dia (inclusive), com o mesmo
  // cálculo do card "Conformidade geral" — por isso o ponto de hoje sempre
  // bate com esse card. Ordenada do dia mais antigo (esquerda) pro mais
  // atual/hoje (direita), últimos DIAS_JANELA dias.
  const serieDiaria = useMemo(() => {
    const inspecoesOrdenadas = [...inspecoes].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    const dias: { dia: string; conformidade: number }[] = []
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    let ok = 0
    let total = 0
    let ponteiro = 0
    for (let i = DIAS_JANELA - 1; i >= 0; i--) {
      const d = new Date(hoje)
      d.setDate(d.getDate() - i)
      const fimDoDia = new Date(d)
      fimDoDia.setHours(23, 59, 59, 999)
      const label = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d)
      while (
        ponteiro < inspecoesOrdenadas.length &&
        new Date(inspecoesOrdenadas[ponteiro].date) <= fimDoDia
      ) {
        const c = contarConformidade(inspecoesOrdenadas[ponteiro])
        ok += c.ok
        total += c.total
        ponteiro++
      }
      dias.push({ dia: label, conformidade: total > 0 ? Math.round((ok / total) * 100) : 0 })
    }
    return dias
  }, [inspecoes])

  const contagensGerais = useMemo(() => inspecoes.map(contarConformidade), [inspecoes])
  const totalAvaliacoes = contagensGerais.reduce((s, x) => s + x.total, 0)
  const totalOk = contagensGerais.reduce((s, x) => s + x.ok, 0)
  const conformidadeGeral =
    totalAvaliacoes > 0 ? Math.round((totalOk / totalAvaliacoes) * 100) : 0

  // "Total de itens avaliados" é a UNIÃO de itens distintos já avaliados em
  // QUALQUER UH — não a soma bruta de avaliações (que infla com inspeções
  // repetidas) nem algo restrito aos itens que TODAS as UHs têm em comum.
  // Um item avaliado numa única UH já entra aqui, mesmo que não esteja
  // atribuído a nenhuma outra unidade (pedido explícito).
  const totalItens = useMemo(() => {
    const ids = new Set<string>()
    for (const insp of inspecoes) {
      for (const it of insp.items) {
        if (it.checklistItemId) ids.add(it.checklistItemId)
      }
    }
    return ids.size
  }, [inspecoes])

  // Largura mínima do gráfico diário — cada dia precisa de espaço pra
  // legenda não amontoar, mesma lógica aplicada no gráfico de UHs da Visão
  // Gerencial (rolagem só dentro do bloco do gráfico, não na tela inteira).
  const larguraGraficoDiario = Math.max(serieDiaria.length * 44, 600)

  // O dia mais recente (hoje) é o último ponto da série, então já nasce
  // rolado pro final — sem isso o usuário abre a tela e cai no dia mais
  // antigo, tendo que arrastar manualmente até achar "hoje" (pedido
  // explícito pra abrir direto no dia mais recente).
  const scrollGraficoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollGraficoRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [serieDiaria])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Conformidade geral"
          value={`${conformidadeGeral}%`}
          hint="média histórica"
          tone="success"
          icon={<Activity className="h-[18px] w-[18px]" />}
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
        description={`Percentual de itens conformes por dia (${DIAS_JANELA} dias). Arraste pros lados pra ver os outros dias.`}
      >
        <div className="overflow-x-auto" ref={scrollGraficoRef}>
          <div style={{ minWidth: larguraGraficoDiario }}>
            <ChartContainer
              config={{
                conformidade: { label: 'Conformidade', color: 'var(--chart-2)' },
              }}
              className="h-72 w-full"
            >
              <AreaChart data={serieDiaria} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
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
                  dataKey="conformidade"
                  type="monotone"
                  stroke="var(--color-conformidade)"
                  fill="url(#fillConf)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>
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
          <LineChart data={serieMensal}>
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
