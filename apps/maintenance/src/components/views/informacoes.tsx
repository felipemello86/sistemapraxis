'use client'

import { Fragment, useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronRight as ChevronRightIcon, History, Check, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Panel } from '@/components/ui-kit'
import {
  corCategoria,
  diasDesde,
  formatarData,
  labelResultado,
  temPendencia,
  ultimaInspecaoPorUnidade,
} from '@/lib/domain'
import type { ChecklistItem, InspecaoComUnidade, UnitOption } from '@/lib/types'

// Recupera o "ItemHistoryModal" do protótipo standalone "Bnb Manutenção" —
// clicando numa unidade, vê-se o resultado de cada item da última inspeção;
// clicando num item específico, abre o histórico dele (status/comentário/
// data/inspetor) ao longo de todas as inspeções daquela UH.

export function Informacoes({
  unidades,
  itens,
  inspecoes,
}: {
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
}) {
  const [busca, setBusca] = useState('')
  const [expandida, setExpandida] = useState<string | null>(null)
  const [historico, setHistorico] = useState<{ unidade: UnitOption; item: ChecklistItem } | null>(null)

  const ultimaMap = useMemo(
    () => ultimaInspecaoPorUnidade(inspecoes),
    [inspecoes],
  )

  const itensPorId = useMemo(() => {
    const m = new Map<string, ChecklistItem>()
    for (const it of itens) m.set(it.id, it)
    return m
  }, [itens])

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return unidades
      .filter((u) => !q || u.name.toLowerCase().includes(q))
      .map((u) => {
        const ult = ultimaMap.get(u.id)
        return {
          unidade: u,
          ultima: ult,
          dias: ult ? diasDesde(ult.date) : null,
        }
      })
  }, [unidades, busca, ultimaMap])

  const historicoDoItem = useMemo(() => {
    if (!historico) return []
    return inspecoes
      .filter((insp) => insp.unitId === historico.unidade.id)
      .flatMap((insp) => {
        const it = insp.items.find((i) => i.checklistItemId === historico.item.id)
        return it ? [{ date: insp.date, inspectorName: insp.inspector?.name ?? null, item: it }] : []
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [historico, inspecoes])

  return (
    <div className="space-y-6">
      <Panel
        title="Informações das unidades"
        description="Situação detalhada de cada flat — clique numa unidade pra ver os itens"
        action={
          <div className="relative w-full max-w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar unidade"
              className="h-10 rounded-xl pl-9"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-3 pr-4 font-medium" />
                <th className="pb-3 pr-4 font-medium">Unidade</th>
                <th className="pb-3 pr-4 font-medium">Última inspeção</th>
                <th className="pb-3 pr-4 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {linhas.map(({ unidade, ultima, dias }) => {
                const aberta = expandida === unidade.id
                return (
                  <Fragment key={unidade.id}>
                    <tr
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => setExpandida(aberta ? null : unidade.id)}
                    >
                      <td className="py-3 pl-1 text-muted-foreground">
                        {ultima ? (aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />) : null}
                      </td>
                      <td className="py-3 pr-4 font-medium">{unidade.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {ultima ? (
                          <span>
                            {formatarData(ultima.date)}{' '}
                            <span className="text-xs">({dias} dias)</span>
                          </span>
                        ) : (
                          'Nunca inspecionada'
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {!ultima ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            Pendente
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={
                              temPendencia(ultima)
                                ? 'border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]'
                                : 'border-[var(--success)]/30 bg-[var(--success)]/12 text-[var(--success)]'
                            }
                          >
                            {labelResultado(ultima)}
                          </Badge>
                        )}
                      </td>
                    </tr>
                    {aberta && ultima && (
                      <tr key={`${unidade.id}-detalhe`}>
                        <td colSpan={4} className="bg-muted/30 px-4 py-3">
                          <ul className="divide-y divide-border/70">
                            {ultima.items.map((it) => {
                              const catalogo = it.checklistItemId ? itensPorId.get(it.checklistItemId) : null
                              return (
                                <li key={it.id} className="flex items-center gap-3 py-2">
                                  <span
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                                      it.status === 'CONFORME'
                                        ? 'bg-[var(--success)]/15 text-[var(--success)]'
                                        : 'bg-[var(--warning)]/15 text-[var(--warning)]'
                                    }`}
                                  >
                                    {it.status === 'CONFORME' ? (
                                      <Check className="h-3.5 w-3.5" />
                                    ) : (
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                  {catalogo && (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full"
                                      style={{ backgroundColor: corCategoria(catalogo.category) }}
                                    />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-sm">
                                    {catalogo?.name ?? 'Item removido do catálogo'}
                                  </span>
                                  {catalogo && (
                                    <button
                                      onClick={() => setHistorico({ unidade, item: catalogo })}
                                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    >
                                      <History className="h-3.5 w-3.5" />
                                      Histórico
                                    </button>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {linhas.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma unidade encontrada.
            </p>
          )}
        </div>
      </Panel>

      <Dialog open={historico !== null} onOpenChange={(open) => !open && setHistorico(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {historico ? `Unidade ${historico.unidade.name} — ${historico.item.name}` : ''}
            </DialogTitle>
            {historico?.item.subDescription && (
              <DialogDescription>{historico.item.subDescription}</DialogDescription>
            )}
          </DialogHeader>
          <div className="max-h-[60svh] space-y-2 overflow-y-auto">
            {historicoDoItem.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem histórico disponível.
              </p>
            )}
            {historicoDoItem.map((h, i) => (
              <div
                key={i}
                className={`flex gap-3 rounded-xl border p-3 ${
                  h.item.status === 'CONFORME'
                    ? 'border-[var(--success)]/30 bg-[var(--success)]/8'
                    : 'border-[var(--warning)]/30 bg-[var(--warning)]/8'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    h.item.status === 'CONFORME'
                      ? 'bg-[var(--success)]/15 text-[var(--success)]'
                      : 'bg-[var(--warning)]/15 text-[var(--warning)]'
                  }`}
                >
                  {h.item.status === 'CONFORME' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      {h.item.status === 'CONFORME' ? 'Conforme' : 'Não conforme'}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatarData(h.date)}</span>
                  </div>
                  {h.item.comment && (
                    <p className="mt-1 text-xs text-muted-foreground">{h.item.comment}</p>
                  )}
                  {h.inspectorName && (
                    <p className="mt-1 text-xs text-muted-foreground">por {h.inspectorName}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
