'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Panel, StatCard } from '@/components/ui-kit'
import { Activity, ClipboardList, Maximize2, Minimize2 } from 'lucide-react'
import { contarConformidade, itensParaUnidade, ultimaInspecaoRealPorUnidade } from '@/lib/domain'
import type { AtribuicoesPorUnidade, ChecklistItem, ConformitySnapshot, InspecaoComUnidade, UnitOption } from '@/lib/types'

// Janela da série diária de conformidade — era 30 dias (pedido antigo: era
// mensal, virou diária, hoje sempre na ponta direita). Ajustada pra 3 meses
// (pedido do Felipe) — o histórico fictício semeado em
// MaintenanceConformitySnapshot cobre essa mesma janela (ver script de seed).
const DIAS_JANELA = 90

// Cor por score — vermelho (ruim) -> amber -> verde (bom), interpolação
// linear em 2 trechos (0-50 e 50-100). Usada nos stops do gradiente
// horizontal do gráfico de Conformidade (pedido do Felipe: "a área sob a
// curva ir mudando de cor conforme o score, quanto pior mais vermelho").
function corPorScore(pct: number): string {
  const paradas: [number, [number, number, number]][] = [
    [0, [239, 68, 68]], // red-500
    [50, [245, 158, 11]], // amber-500
    [100, [34, 197, 94]], // green-500
  ]
  const clamped = Math.max(0, Math.min(100, pct))
  let i = 0
  while (i < paradas.length - 2 && clamped > paradas[i + 1][0]) i++
  const [p0, c0] = paradas[i]
  const [p1, c1] = paradas[i + 1]
  const t = p1 === p0 ? 0 : (clamped - p0) / (p1 - p0)
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * t)
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * t)
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * t)
  return `rgb(${r}, ${g}, ${b})`
}

// Formata como "YYYY-MM-DD" em horário LOCAL (não usar toISOString, que
// converte pra UTC e pode empurrar a data um dia pra trás/frente perto da
// meia-noite) — precisa bater com o formato gravado em
// MaintenanceConformitySnapshot.data.
function isoLocal(d: Date) {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function Evolucao({
  inspecoes,
  unidades,
  itens,
  atribuicoes,
  conformitySnapshots,
  meta,
}: {
  inspecoes: InspecaoComUnidade[]
  unidades: UnitOption[]
  itens: ChecklistItem[]
  atribuicoes: AtribuicoesPorUnidade
  // Fallback decorativo (ver comentário no schema, model
  // MaintenanceConformitySnapshot) — só usado nos dias sem nenhuma inspeção
  // real ainda; o dia em que a primeira inspeção real acontecer (em
  // qualquer UH) e todo dia depois sempre usa o valor real, mesmo que exista
  // uma linha de snapshot pra ele.
  conformitySnapshots: ConformitySnapshot[]
  // Meta de conformidade (%) configurável em Configurações — mesmo valor
  // usado no hint "meta: X%" da Visão Gerencial (config.goal). Desenhada
  // como linha de referência tracejada no gráfico de evolução.
  meta: number
}) {
  const snapshotPorDia = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of conformitySnapshots) m.set(s.data, s.conformidade)
    return m
  }, [conformitySnapshots])
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

  // Conformidade ao longo do tempo — o ESTADO da conformidade geral em cada
  // dia, não "conformidade das inspeções feitas naquele dia" (isso derrubava
  // o gráfico pra 0% em qualquer dia sem inspeção nova). Estado = pra cada
  // UH, a inspeção mais recente com data até aquele dia (a mesma lógica de
  // ultimaInspecaoPorUnidade, só que "congelada" naquele corte de data) —
  // por isso o ponto de hoje sempre bate com o card "Conformidade atual"
  // (que usa o mesmo critério, sem corte). Ordenada do dia mais antigo
  // (esquerda) pro mais atual/hoje (direita), últimos DIAS_JANELA dias.
  const serieDiaria = useMemo(() => {
    // Ignora inspeções avulsa=true (relato avulso, não Rota de Inspeção
    // completa) — mesmo critério do card "Conformidade atual" abaixo
    // (ultimaInspecaoRealPorUnidade) e da Visão Gerencial, pra o ponto de
    // hoje sempre bater entre as telas.
    const inspecoesOrdenadas = inspecoes
      .filter((insp) => !insp.avulsa)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const dias: { dia: string; conformidade: number }[] = []
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const ultimaPorUnidadeAteODia = new Map<string, InspecaoComUnidade>()
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
        const insp = inspecoesOrdenadas[ponteiro]
        ultimaPorUnidadeAteODia.set(insp.unitId, insp)
        ponteiro++
      }
      const contagens = Array.from(ultimaPorUnidadeAteODia.values()).map(contarConformidade)
      const total = contagens.reduce((s, x) => s + x.total, 0)
      const ok = contagens.reduce((s, x) => s + x.ok, 0)
      // total > 0 = já existe pelo menos uma inspeção real até este dia →
      // valor real sempre prevalece. Sem isso ainda (dias antes da primeira
      // inspeção de verdade), cai no snapshot decorativo se existir um pra
      // essa data, senão 0 (mesmo comportamento de antes).
      const conformidade = total > 0 ? Math.round((ok / total) * 100) : (snapshotPorDia.get(isoLocal(d)) ?? 0)
      dias.push({ dia: label, conformidade })
    }
    return dias
  }, [inspecoes, snapshotPorDia])

  // Stops do gradiente horizontal (um por dia da série) — cada stop usa a
  // cor correspondente ao score daquele dia (corPorScore acima), criando o
  // efeito de a área/linha mudar de cor ao longo do eixo X conforme o score
  // sobe ou desce, em vez do gradiente estático de 2 cores de antes.
  const stopsGradiente = useMemo(() => {
    const n = serieDiaria.length
    if (n === 0) return []
    return serieDiaria.map((d, i) => ({
      offset: `${(i / Math.max(n - 1, 1)) * 100}%`,
      cor: corPorScore(d.conformidade),
    }))
  }, [serieDiaria])

  // Conformidade ATUAL (não é média histórica): considera só a inspeção mais
  // recente de cada UH — o estado de hoje, não a mistura de todas as
  // inspeções já feitas ao longo do tempo (isso inflava/distorcia o número
  // com UHs reinspecionadas várias vezes).
  const ultimaPorUnidade = useMemo(() => ultimaInspecaoRealPorUnidade(inspecoes), [inspecoes])
  const contagensAtuais = useMemo(
    () => Array.from(ultimaPorUnidade.values()).map(contarConformidade),
    [ultimaPorUnidade],
  )
  const itensInspecionadosAtual = contagensAtuais.reduce((s, x) => s + x.total, 0)
  const conformeAtual = contagensAtuais.reduce((s, x) => s + x.ok, 0)
  const conformidadeAtual =
    itensInspecionadosAtual > 0 ? Math.round((conformeAtual / itensInspecionadosAtual) * 100) : 0

  // Total de itens de verificação do HOTEL — soma dos itens de checklist
  // aplicáveis a cada UH (itensParaUnidade), inspecionados ou não. Diferente
  // do denominador da fração acima (que só conta o que já foi inspecionado
  // ao menos uma vez) — este é o universo completo, serve de contexto/escala.
  const totalItensHotel = useMemo(
    () => unidades.reduce((s, u) => s + itensParaUnidade(u.id, itens, atribuicoes).length, 0),
    [unidades, itens, atribuicoes],
  )

  // Largura mínima do gráfico diário — cada dia precisa de espaço pra
  // legenda não amontoar, mesma lógica aplicada no gráfico de UHs da Visão
  // Gerencial (rolagem só dentro do bloco do gráfico, não na tela inteira).
  // Usada só no modo COMPACTO (card pequeno) — no modo expandido o gráfico
  // ocupa a tela toda, então cabe a janela inteira sem precisar rolar (ver
  // `intervaloExpandido` abaixo).
  const larguraGraficoDiario = Math.max(serieDiaria.length * 44, 600)

  // No modo expandido, mostrar TODOS os dias como rótulo (interval={0})
  // amontoaria ~90 legendas na largura da tela. Em vez de forçar rolagem
  // (que foi a reclamação do Felipe: "a janela está muito curta, só 1 mês"
  // — na real ele só via o final da rolagem), pulamos rótulos pra caber a
  // janela inteira de uma vez, mirando ~15 legendas visíveis.
  const intervaloExpandido = Math.max(0, Math.ceil(serieDiaria.length / 15) - 1)

  // Modo maximizado do gráfico "Conformidade ao longo do tempo" — pedido
  // explícito do Felipe: com a janela em DIAS_JANELA dias (3 meses), o
  // gráfico fica bem mais largo, então ajuda ter um jeito de
  // expandir pra tela cheia do navegador em vez de só rolar dentro do card
  // pequeno. Trava o scroll da página por trás enquanto expandido (senão dá
  // pra rolar o conteúdo atrás do overlay, que fica meio quebrado) e fecha
  // com Esc além do botão. Declarado ANTES do efeito de scroll logo abaixo,
  // que depende dele.
  const [expandido, setExpandido] = useState(false)
  useEffect(() => {
    if (!expandido) return
    const bodyOverflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpandido(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = bodyOverflowAnterior
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [expandido])

  // O dia mais recente (hoje) é o último ponto da série, então já nasce
  // rolado pro final — sem isso o usuário abre a tela e cai no dia mais
  // antigo, tendo que arrastar manualmente até achar "hoje" (pedido
  // explícito pra abrir direto no dia mais recente).
  // Mesmo ref usado nos dois modos (compacto/expandido) — só um dos dois
  // divs de scroll está montado por vez (ver `expandido` acima), então não
  // há conflito. `expandido` entra nas dependências pra rolar de novo pro
  // final ao trocar de modo (o outro div nasce com scrollLeft=0 senão).
  const scrollGraficoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollGraficoRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [serieDiaria, expandido])

  // Conteúdo do gráfico em si — extraído numa função (não uma variável fixa)
  // pra não duplicar o AreaChart inteiro entre o card normal e o overlay
  // maximizado abaixo; recebe o `interval` do XAxis como parâmetro porque
  // ele difere entre os dois modos (ver intervaloExpandido acima).
  function renderGraficoConformidade(interval: number) {
    return (
      <AreaChart data={serieDiaria} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
        <defs>
          {/* Gradiente HORIZONTAL (x1→x2, não y1→y2 como antes) — um stop por
              dia, cor conforme o score daquele dia (stopsGradiente acima).
              Dois gradientes com os mesmos stops de cor: um mais translúcido
              pro preenchimento da área, outro opaco pro traço da linha. */}
          <linearGradient id="fillConf" x1="0" y1="0" x2="1" y2="0">
            {stopsGradiente.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.cor} stopOpacity={0.35} />
            ))}
          </linearGradient>
          <linearGradient id="strokeConf" x1="0" y1="0" x2="1" y2="0">
            {stopsGradiente.map((s, i) => (
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
        <YAxis tickLine={false} axisLine={false} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        {/* Linha de meta — mesmo valor configurável usado no hint "meta: X%"
            da Visão Gerencial (config.goal, setup inicial 90%). */}
        <ReferenceLine
          y={meta}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: `Meta ${meta}%`,
            position: 'insideTopRight',
            fill: 'var(--muted-foreground)',
            fontSize: 11,
          }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="conformidade"
          type="monotone"
          stroke="url(#strokeConf)"
          fill="url(#fillConf)"
          strokeWidth={2.5}
        />
      </AreaChart>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Conformidade geral"
          value={`${conformidadeAtual}%`}
          tone="success"
          icon={<Activity className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Itens de Verificação"
          value={`${conformeAtual}/${itensInspecionadosAtual}`}
          hint={`${totalItensHotel} itens de verificação do hotel no total`}
          tone="primary"
          icon={<ClipboardList className="h-[18px] w-[18px]" />}
        />
      </div>

      {!expandido ? (
        <Panel
          title="Conformidade ao longo do tempo"
          description={`Percentual de itens conformes por dia (${DIAS_JANELA} dias). Arraste pros lados pra ver os outros dias.`}
          action={
            <button
              type="button"
              onClick={() => setExpandido(true)}
              title="Expandir gráfico"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          }
        >
          <div className="overflow-x-auto" ref={scrollGraficoRef}>
            <div style={{ minWidth: larguraGraficoDiario }}>
              <ChartContainer
                config={{
                  conformidade: { label: 'Conformidade', color: 'var(--chart-2)' },
                }}
                className="h-72 w-full"
              >
                {renderGraficoConformidade(0)}
              </ChartContainer>
            </div>
          </div>
        </Panel>
      ) : (
        // Só um dos dois (compacto OU expandido) fica montado por vez —
        // renderizar os dois ao mesmo tempo duplicaria o id do
        // <linearGradient> (mesmo JSX reaproveitado nos dois), que é único
        // por documento; com getElementById dando ambíguo, o preenchimento
        // do segundo gráfico ficaria arriscado.
        <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 md:p-6">
          <Panel
            title="Conformidade ao longo do tempo"
            description={`Percentual de itens conformes por dia (${DIAS_JANELA} dias) — janela inteira visível abaixo.`}
            action={
              <button
                type="button"
                onClick={() => setExpandido(false)}
                title="Reduzir gráfico (Esc)"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            }
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Sem rolagem aqui (diferente do modo compacto acima) — o
                objetivo do modo expandido é justamente caber a janela
                inteira de uma vez (pedido do Felipe: "a janela está muito
                curta, só mostra 1 mês" — o problema era precisar rolar pra
                ver o resto). O gráfico ocupa 100% da largura disponível e
                os rótulos do eixo X pulam de acordo com intervaloExpandido. */}
            <div className="min-h-0 flex-1" ref={scrollGraficoRef}>
              <ChartContainer
                config={{
                  conformidade: { label: 'Conformidade', color: 'var(--chart-2)' },
                }}
                className="h-full w-full"
              >
                {renderGraficoConformidade(intervaloExpandido)}
              </ChartContainer>
            </div>
          </Panel>
        </div>
      )}

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
