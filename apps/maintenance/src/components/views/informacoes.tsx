'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import {
  Search,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  History,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  ClipboardList,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Panel } from '@/components/ui-kit'
import { toast } from 'sonner'
import {
  contarConformidade,
  corCategoria,
  diasDesde,
  formatarData,
  itensParaUnidade,
  labelResultado,
  temPendencia,
  ultimaInspecaoPorUnidade,
} from '@/lib/domain'
import { deleteInspecaoAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { InspecaoWizard } from '@/components/inspecao-wizard'
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  InspecaoComUnidade,
  UnitOption,
} from '@/lib/types'

// Fusão de "Informações" + "Controle de Inspeções" (eram telas redundantes:
// as duas listavam unidade x última inspeção, só que uma dava pra iniciar
// inspeção e a outra dava pra ver o histórico de itens). Agora é uma tela só:
// cada linha de UH já tem o botão "Iniciar inspeção" de cara, e expandir a
// linha mostra a lista de TODAS as inspeções já realizadas naquela unidade
// (não só a última); expandir uma inspeção dentro dessa lista mostra os
// itens dela (com o mesmo "Histórico do item" cross-inspeções de antes).

export function Informacoes({
  unidades,
  itens,
  inspecoes,
  atribuicoes,
}: {
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  atribuicoes: AtribuicoesPorUnidade
}) {
  const [pending, startTransition] = useTransition()
  const [busca, setBusca] = useState('')
  const [expandida, setExpandida] = useState<string | null>(null)
  const [inspecaoExpandida, setInspecaoExpandida] = useState<string | null>(null)
  const [historico, setHistorico] = useState<{ unidade: UnitOption; item: ChecklistItem } | null>(null)
  const [unidadeAtiva, setUnidadeAtiva] = useState<UnitOption | null>(null)

  const ultimaMap = useMemo(() => ultimaInspecaoPorUnidade(inspecoes), [inspecoes])

  const inspecoesPorUnidade = useMemo(() => {
    const m = new Map<string, InspecaoComUnidade[]>()
    for (const insp of inspecoes) {
      const lista = m.get(insp.unitId) ?? []
      lista.push(insp)
      m.set(insp.unitId, lista)
    }
    for (const lista of m.values()) {
      lista.sort((a, b) => b.date.localeCompare(a.date))
    }
    return m
  }, [inspecoes])

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
          historico: inspecoesPorUnidade.get(u.id) ?? [],
        }
      })
  }, [unidades, busca, ultimaMap, inspecoesPorUnidade])

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

  function toggleUnidade(id: string) {
    setExpandida((atual) => (atual === id ? null : id))
    setInspecaoExpandida(null)
  }

  function iniciarInspecao(unidade: UnitOption, e: React.MouseEvent) {
    e.stopPropagation()
    const itensFiltrados = itensParaUnidade(unidade.id, itens, atribuicoes)
    if (itensFiltrados.length === 0) {
      toast.error('Essa unidade não tem itens de checklist atribuídos.')
      return
    }
    setUnidadeAtiva(unidade)
  }

  function encerrarInspecao() {
    setUnidadeAtiva(null)
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    startTransition(async () => {
      try {
        unwrapSafeAction(await deleteInspecaoAction(id))
        toast.success('Inspeção removida.')
      } catch {
        toast.error('Erro ao remover inspeção.')
      }
    })
  }

  if (unidadeAtiva) {
    const itensDaUnidade = itensParaUnidade(unidadeAtiva.id, itens, atribuicoes)
    return (
      <InspecaoWizard
        unidade={unidadeAtiva}
        itens={itensDaUnidade}
        onCancel={encerrarInspecao}
        onSaved={encerrarInspecao}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Informações das unidades"
        description="Toque numa unidade pra ver o histórico de inspeções, ou inicie uma nova direto na linha"
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
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {linhas.map(({ unidade, ultima, dias, historico: historicoDaUnidade }) => {
                const aberta = expandida === unidade.id
                return (
                  <Fragment key={unidade.id}>
                    <tr
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => toggleUnidade(unidade.id)}
                    >
                      <td className="py-3 pl-1 text-muted-foreground">
                        {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
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
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          onClick={(e) => iniciarInspecao(unidade, e)}
                          className="h-8 rounded-lg"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Iniciar inspeção
                        </Button>
                      </td>
                    </tr>
                    {aberta && (
                      <tr key={`${unidade.id}-detalhe`}>
                        <td colSpan={5} className="bg-muted/30 px-4 py-3">
                          {historicoDaUnidade.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">
                              Nenhuma inspeção registrada nessa unidade ainda.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {historicoDaUnidade.map((insp) => {
                                const { ok, total } = contarConformidade(insp)
                                const inspAberta = inspecaoExpandida === insp.id
                                return (
                                  <div
                                    key={insp.id}
                                    className="rounded-xl border border-border/70 bg-background"
                                  >
                                    <div
                                      className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
                                      onClick={() =>
                                        setInspecaoExpandida((atual) => (atual === insp.id ? null : insp.id))
                                      }
                                    >
                                      {inspAberta ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">
                                          {formatarData(insp.date)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {insp.inspector?.name ?? '—'} · {ok}/{total} conformes
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
                                      <button
                                        onClick={(e) => handleDelete(insp.id, e)}
                                        disabled={pending}
                                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                        aria-label="Remover inspeção"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                    {inspAberta && (
                                      <ul className="divide-y divide-border/70 border-t border-border/70 px-3">
                                        {insp.items.map((it) => {
                                          const catalogo = it.checklistItemId
                                            ? itensPorId.get(it.checklistItemId)
                                            : null
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
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {linhas.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-muted-foreground">
                <ClipboardList className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma unidade encontrada.</p>
            </div>
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
