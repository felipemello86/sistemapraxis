'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, Check, AlertTriangle, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Panel } from '@/components/ui-kit'
import { toast } from 'sonner'
import {
  contarConformidade,
  formatarData,
  labelResultado,
  temPendencia,
} from '@/lib/domain'
import { createInspecaoAction, deleteInspecaoAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import type {
  InspecaoComUnidade,
  ChecklistItem,
  UnitOption,
} from '@/lib/types'

export function ControleInspecoes({
  unidades,
  itens,
  inspecoes,
}: {
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [unidadeId, setUnidadeId] = useState<string>('')
  const [statusItens, setStatusItens] = useState<Record<string, boolean>>({})
  const [obsItens, setObsItens] = useState<Record<string, string>>({})

  function resetForm() {
    setUnidadeId('')
    setStatusItens({})
    setObsItens({})
  }

  function handleSubmit() {
    if (!unidadeId) {
      toast.error('Selecione uma unidade.')
      return
    }
    const itensPayload = itens.map((it) => ({
      checklistItemId: it.id,
      status: (statusItens[it.id] === false
        ? 'NAO_CONFORME'
        : 'CONFORME') as 'CONFORME' | 'NAO_CONFORME',
      comment: obsItens[it.id] || undefined,
    }))

    startTransition(async () => {
      try {
        unwrapSafeAction(
          await createInspecaoAction({
            uhId: unidadeId,
            itens: itensPayload,
          }),
        )
        toast.success('Inspeção registrada com sucesso.')
        resetForm()
        setOpen(false)
      } catch {
        toast.error('Não foi possível salvar a inspeção.')
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        unwrapSafeAction(await deleteInspecaoAction(id))
        toast.success('Inspeção removida.')
      } catch {
        toast.error('Erro ao remover inspeção.')
      }
    })
  }

  const problemasSelecionados = itens.filter(
    (it) => statusItens[it.id] === false,
  ).length

  return (
    <div className="space-y-6">
      <Panel
        title="Controle de inspeções"
        description={`${inspecoes.length} inspeções registradas`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button className="h-10 rounded-xl">
                  <Plus className="h-4 w-4" />
                  Nova inspeção
                </Button>
              }
            />
            <DialogContent className="max-h-[88svh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
              <DialogHeader className="border-b border-border/70 px-6 py-4">
                <DialogTitle>Nova inspeção</DialogTitle>
                <DialogDescription>
                  Avalie cada item e marque os que apresentam problema.
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[60svh] space-y-5 overflow-y-auto px-6 py-5">
                <div className="flex flex-col gap-2">
                  <Label>Unidade</Label>
                  <Select
                    value={unidadeId}
                    onValueChange={(v) => setUnidadeId(v ?? '')}
                  >
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          Unidade {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>Itens de inspeção</Label>
                    <span className="text-xs text-muted-foreground">
                      {problemasSelecionados} marcados com problema
                    </span>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-border/70 p-2">
                    {itens.map((it) => {
                      const problema = statusItens[it.id] === false
                      return (
                        <div
                          key={it.id}
                          className="rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {it.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {it.category}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setStatusItens((s) => ({
                                    ...s,
                                    [it.id]: true,
                                  }))
                                }
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                                  !problema
                                    ? 'border-[var(--success)]/40 bg-[var(--success)]/15 text-[var(--success)]'
                                    : 'border-border text-muted-foreground hover:bg-accent'
                                }`}
                                aria-label="Conforme"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setStatusItens((s) => ({
                                    ...s,
                                    [it.id]: false,
                                  }))
                                }
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                                  problema
                                    ? 'border-[var(--warning)]/40 bg-[var(--warning)]/15 text-[var(--warning)]'
                                    : 'border-border text-muted-foreground hover:bg-accent'
                                }`}
                                aria-label="Problema"
                              >
                                <AlertTriangle className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {problema && (
                            <Input
                              value={obsItens[it.id] ?? ''}
                              onChange={(e) =>
                                setObsItens((s) => ({
                                  ...s,
                                  [it.id]: e.target.value,
                                }))
                              }
                              placeholder="Descreva o problema"
                              className="mt-2 h-9 rounded-lg"
                            />
                          )}
                        </div>
                      )
                    })}
                    {itens.length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        Nenhum item cadastrado no catálogo ainda.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t border-border/70 px-6 py-4">
                <Button
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={pending}
                  className="rounded-xl"
                >
                  {pending ? 'Salvando...' : 'Salvar inspeção'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {inspecoes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-muted-foreground">
              <ClipboardList className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nenhuma inspeção registrada. Comece criando a primeira.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Unidade</th>
                  <th className="pb-3 pr-4 font-medium">Inspetor</th>
                  <th className="pb-3 pr-4 font-medium">Data</th>
                  <th className="pb-3 pr-4 font-medium">Resultado</th>
                  <th className="pb-3 pr-4 font-medium">Situação</th>
                  <th className="pb-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {inspecoes.map((insp) => {
                  const { ok, total } = contarConformidade(insp)
                  return (
                    <tr key={insp.id} className="hover:bg-accent/40">
                      <td className="py-3 pr-4 font-medium">
                        {insp.unit.name}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {insp.inspector?.name ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatarData(insp.date)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {ok}/{total} conformes
                      </td>
                      <td className="py-3 pr-4">
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
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDelete(insp.id)}
                          disabled={pending}
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remover inspeção"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
