'use client'

import { useMemo, useState } from 'react'
import {
  Building2,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { ItemInfoField } from '@/components/item-info-field'
import type {
  InspecaoComUnidade,
  ChecklistItem,
  ItemInfo,
  ItemInfoLogEntry,
  UnitOption,
} from '@/lib/types'

// Recuperado do protótipo standalone "Bnb Manutenção" (PageVisaoGerencial):
// gráfico de barras de conformidade por UH (clicável) + tabela de itens não
// conformes à direita (reage ao clique na barra) + painel de detalhe abaixo
// do gráfico (reage ao clique numa linha da tabela: comentário, fotos e
// histórico do item). A v2 anterior desta tela tinha um gráfico "Inspeções
// por mês" + pizza de categorias no lugar disso — trocados por completo.

type NcRow = {
  unitId: string
  unitName: string
  checklistItemId: string
  itemName: string
  category: string
  comment: string | null
  photos: string[]
  date: string
}

export function VisaoGerencial({
  podeOperar,
  unidades,
  itens,
  inspecoes,
  meta,
  itemInfos,
  itemInfoLogs,
}: {
  podeOperar: boolean
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  meta: number
  itemInfos: ItemInfo[]
  itemInfoLogs: ItemInfoLogEntry[]
}) {
  const [uhSelecionada, setUhSelecionada] = useState<string | null>(null)
  const [ncSelecionado, setNcSelecionado] = useState<NcRow | null>(null)

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

  const itensPorId = useMemo(() => {
    const m = new Map<string, ChecklistItem>()
    for (const it of itens) m.set(it.id, it)
    return m
  }, [itens])

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

  // Barras: uma por UH. Prioridade da esquerda pra direita (pedido
  // explícito): 1) inspecionadas com pior conformidade, 2) inspecionadas com
  // melhor conformidade, 3) nunca inspecionadas por último — nesse grupo não
  // tem "pontuação" pra ordenar, então cai por nome de UH. Antes essas
  // ficavam misturadas com as piores porque ambas tinham value=0.
  const barData = useMemo(() => {
    const comInspecao: { unitId: string; label: string; value: number }[] = []
    const semInspecao: { unitId: string; label: string; value: number }[] = []
    for (const u of unidades) {
      const ult = ultimaMap.get(u.id)
      const { ok, total } = ult ? contarConformidade(ult) : { ok: 0, total: 0 }
      const entry = { unitId: u.id, label: u.name, value: total > 0 ? Math.round((ok / total) * 100) : 0 }
      ;(total > 0 ? comInspecao : semInspecao).push(entry)
    }
    comInspecao.sort((a, b) => a.value - b.value)
    semInspecao.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }))
    return [...comInspecao, ...semInspecao]
  }, [unidades, ultimaMap])

  function corBarra(value: number) {
    if (value >= 90) return 'var(--success)'
    if (value >= 70) return 'var(--warning)'
    return 'var(--destructive)'
  }

  // Todos os itens não conformes da última inspeção de cada UH (ou só da
  // UH selecionada no gráfico).
  const ncList = useMemo<NcRow[]>(() => {
    const fontes = uhSelecionada
      ? Array.from(ultimaMap.entries()).filter(([uhId]) => uhId === uhSelecionada)
      : Array.from(ultimaMap.entries())
    const rows: NcRow[] = []
    for (const [, insp] of fontes) {
      for (const it of insp.items) {
        if (it.status !== 'NAO_CONFORME' || !it.checklistItemId) continue
        const catalogo = itensPorId.get(it.checklistItemId)
        rows.push({
          unitId: insp.unitId,
          unitName: insp.unit.name,
          checklistItemId: it.checklistItemId,
          itemName: catalogo?.name ?? 'Item removido do catálogo',
          category: catalogo?.category ?? '—',
          comment: it.comment,
          photos: it.photos,
          date: insp.date,
        })
      }
    }
    return rows.sort((a, b) => a.unitName.localeCompare(b.unitName))
  }, [uhSelecionada, ultimaMap, itensPorId])

  // Histórico do item selecionado ao longo de todas as inspeções daquela UH
  // (não só a última) — mesmo comportamento do ItemHistoryModal.
  const historicoDoItem = useMemo(() => {
    if (!ncSelecionado) return []
    return inspecoes
      .filter((insp) => insp.unitId === ncSelecionado.unitId)
      .flatMap((insp) => {
        const it = insp.items.find((i) => i.checklistItemId === ncSelecionado.checklistItemId)
        return it ? [{ date: insp.date, status: it.status, comment: it.comment }] : []
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
  }, [ncSelecionado, inspecoes])

  function clicarBarra(data: { unitId: string }) {
    setUhSelecionada((atual) => (atual === data.unitId ? null : data.unitId))
    setNcSelecionado(null)
  }

  function clicarLinhaNc(row: NcRow) {
    setNcSelecionado((atual) =>
      atual && atual.unitId === row.unitId && atual.checklistItemId === row.checklistItemId
        ? null
        : row,
    )
  }

  const nomeUhSelecionada = uhSelecionada ? unidades.find((u) => u.id === uhSelecionada)?.name : null

  // Largura mínima do gráfico — cada barra precisa de espaço pra legenda não
  // amontoar (pedido explícito: preferir rolagem horizontal só no gráfico a
  // ter as legendas ilegíveis). 44px por barra é suficiente pro texto
  // inclinado a -45° não se sobrepor, com um piso de 600px pra poucas UHs.
  const larguraGrafico = Math.max(barData.length * 44, 600)

  return (
    <div className="space-y-6">
      {/* Conformidade é a métrica-resumo desta tela — vem primeiro, seguida
          do gráfico que a detalha por UH. Os demais cards (contagens brutas)
          vêm depois, como apoio. Unidades divide a linha com Conformidade
          pra esse card não ocupar a largura inteira sozinho. */}
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          label="Conformidade"
          value={conformidade === null ? '—' : `${conformidade}%`}
          hint={`meta: ${meta}%`}
          tone={conformidade !== null && conformidade >= meta ? 'success' : 'warning'}
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Unidades"
          value={totalUnidades}
          hint={`${inspecionadas} já inspecionadas`}
          tone="primary"
          icon={<Building2 className="h-[18px] w-[18px]" />}
        />
      </div>

      <Panel
        title={
          nomeUhSelecionada
            ? `Conformidade por UH — selecionada: ${nomeUhSelecionada} (clique de novo pra limpar)`
            : 'Conformidade por UH'
        }
        description={
          barData.length === 0
            ? undefined
            : 'Clique numa barra pra filtrar a tabela de detalhamento. Arraste pros lados pra ver todas as unidades.'
        }
      >
        {barData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma unidade cadastrada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: larguraGrafico }}>
              <ChartContainer config={{ value: { label: 'Conformidade' } }} className="h-72 w-full">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={0}
                    angle={barData.length > 12 ? -45 : 0}
                    textAnchor={barData.length > 12 ? 'end' : 'middle'}
                    height={barData.length > 12 ? 50 : 24}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(value) => [`${value}%`, 'Conformidade']} />}
                  />
                  <Bar
                    dataKey="value"
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                    onClick={(data: any) => clicarBarra(data)}
                  >
                    {barData.map((entry) => (
                      <Cell
                        key={entry.unitId}
                        fill={corBarra(entry.value)}
                        fillOpacity={uhSelecionada && uhSelecionada !== entry.unitId ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </Panel>

      {/* Detalhamento vem logo após o gráfico (mesma lógica: são o par
          "resumo visual" + "lista pra investigar"), e o painel de detalhe do
          item selecionado agora fica abaixo da tabela, não acima. */}
      <div className="space-y-6">
        <Panel
          title={nomeUhSelecionada ? `Não conformes — ${nomeUhSelecionada}` : 'Detalhamento (Não Conformes)'}
        >
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">UH</th>
                  <th className="pb-2 pr-2 font-medium">Item</th>
                  <th className="pb-2 font-medium">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {ncList.slice(0, 60).map((r, i) => {
                  const ativo =
                    ncSelecionado?.unitId === r.unitId && ncSelecionado?.checklistItemId === r.checklistItemId
                  return (
                    <tr
                      key={`${r.unitId}-${r.checklistItemId}-${i}`}
                      onClick={() => clicarLinhaNc(r)}
                      className={`cursor-pointer transition-colors ${ativo ? 'bg-accent' : 'hover:bg-accent/40'}`}
                    >
                      <td className="py-2 pr-2 font-medium">{r.unitName}</td>
                      <td className="py-2 pr-2 text-muted-foreground">{r.itemName}</td>
                      <td className="py-2">
                        <Badge
                          variant="outline"
                          style={{ borderColor: corCategoria(r.category), color: corCategoria(r.category) }}
                        >
                          {r.category}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {ncList.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                ✅ Tudo conforme.
              </p>
            )}
          </div>
        </Panel>

        {ncSelecionado && (
            <Panel>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: corCategoria(ncSelecionado.category) }}
                  />
                  <div>
                    <p className="text-sm font-semibold">{ncSelecionado.itemName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Unidade {ncSelecionado.unitName}</span>
                      {' · '}
                      {ncSelecionado.category}
                      {' · '}
                      Inspeção de {formatarData(ncSelecionado.date)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setNcSelecionado(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ItemInfoField
                uhId={ncSelecionado.unitId}
                checklistItemId={ncSelecionado.checklistItemId}
                initialInfo={
                  itemInfos.find(
                    (i) => i.uhId === ncSelecionado.unitId && i.checklistItemId === ncSelecionado.checklistItemId,
                  )?.info ?? null
                }
                podeOperar={podeOperar}
                logs={itemInfoLogs.filter(
                  (l) => l.uhId === ncSelecionado.unitId && l.checklistItemId === ncSelecionado.checklistItemId,
                )}
                className="mb-6"
              />

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Ocorrência registrada
                  </p>
                  {ncSelecionado.comment ? (
                    <div className="rounded-xl border-l-4 border-destructive bg-destructive/8 px-3.5 py-2.5 text-sm leading-relaxed">
                      {ncSelecionado.comment}
                    </div>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">Sem comentário registrado</p>
                  )}

                  {ncSelecionado.photos.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Fotos ({ncSelecionado.photos.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ncSelecionado.photos.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={url}
                            src={url}
                            alt="Evidência"
                            onClick={() => window.open(url)}
                            className="h-16 w-16 cursor-pointer rounded-lg border border-border/70 object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Histórico do item
                  </p>
                  <div className="space-y-1.5">
                    {historicoDoItem.length === 0 && (
                      <p className="text-xs italic text-muted-foreground">Sem histórico disponível</p>
                    )}
                    {historicoDoItem.map((h, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                          h.status === 'CONFORME'
                            ? 'border-[var(--success)]/30 bg-[var(--success)]/8'
                            : 'border-destructive/30 bg-destructive/8'
                        }`}
                      >
                        <span
                          className={`font-semibold ${
                            h.status === 'CONFORME' ? 'text-[var(--success)]' : 'text-destructive'
                          }`}
                        >
                          {h.status === 'CONFORME' ? 'Conforme' : 'Não conforme'}
                        </span>
                        {h.comment && (
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.comment}</span>
                        )}
                        <span className="ml-auto shrink-0 text-muted-foreground">{formatarData(h.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
      </div>

      <Panel title="Inspeções recentes" description="Últimos registros">
        {inspecoes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma inspeção registrada ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {inspecoes.slice(0, 5).map((insp) => (
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
