'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  itensParaUnidade,
  labelResultado,
  temPendencia,
} from '@/lib/domain'
import { deleteInspecaoAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { InspecaoWizard } from '@/components/inspecao-wizard'
import type {
  AtribuicoesPorUnidade,
  InspecaoComUnidade,
  ChecklistItem,
  UnitOption,
} from '@/lib/types'

// "Nova inspeção" aqui precisa do mesmo modo gamificado (item a item, com
// observação e foto na não conformidade) que a Rota de Manutenção — só a
// forma de chegar até a unidade muda (seleção manual num dialog em vez da
// rota priorizada por dias sem inspeção). A execução em si vive em
// components/inspecao-wizard.tsx, reaproveitada pelas duas telas.

export function ControleInspecoes({
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
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [unidadeId, setUnidadeId] = useState<string>('')
  const [unidadeAtiva, setUnidadeAtiva] = useState<UnitOption | null>(null)

  function iniciarInspecao() {
    const unidade = unidades.find((u) => u.id === unidadeId)
    if (!unidade) {
      toast.error('Selecione uma unidade.')
      return
    }
    const itensFiltrados = itensParaUnidade(unidade.id, itens, atribuicoes)
    if (itensFiltrados.length === 0) {
      toast.error('Essa unidade não tem itens de checklist atribuídos.')
      return
    }
    setUnidadeAtiva(unidade)
    setOpen(false)
    setUnidadeId('')
  }

  function encerrarInspecao() {
    setUnidadeAtiva(null)
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
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
              <DialogHeader className="border-b border-border/70 px-6 py-4">
                <DialogTitle>Nova inspeção</DialogTitle>
                <DialogDescription>
                  Selecione a unidade para iniciar a avaliação item a item.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 px-6 py-5">
                <Label>Unidade</Label>
                <Select value={unidadeId} onValueChange={(v) => setUnidadeId(v ?? '')}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Selecione">
                      {(v: string | null) =>
                        v
                          ? `Unidade ${unidades.find((u) => u.id === v)?.name ?? v}`
                          : 'Selecione'
                      }
                    </SelectValue>
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

              <DialogFooter className="border-t border-border/70 px-6 py-4">
                <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button onClick={iniciarInspecao} className="rounded-xl">
                  Iniciar inspeção
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
