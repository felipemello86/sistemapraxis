'use client'

import { useMemo, useState } from 'react'
import { Camera, CheckCircle2, ClipboardList, Lock, Loader2, ListChecks, Siren } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { corCategoria } from '@/lib/domain'
import { executarCardExecucaoAction, fecharProgramacaoDiaAction } from '@/app/actions/correcao'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import type { CorrectionCardView, DailyCommitmentView } from '@/lib/types'

const MAX_FOTOS_EXECUCAO = 4

function formatarHoraExecucao(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

// Kanban "Execução" — só cards sem serviço externo (needsExternalService
// false) e, se precisar material, já comprado (ver filtro em correcao.tsx).
// "A Fazer" só mostra cards de UHs liberadas pra limpeza hoje na Governança
// (Seleção e Liberação). Selecionar cards aqui + "Fechar programação do dia"
// cria o MaintenanceDailyCommitment de hoje (um por dia, não pode reabrir) —
// só a partir daí os cards viram "Planejadas". "Executadas" volta o IV a
// Conforme automaticamente (resolveCorrectionCard, na Server Action).

export function KanbanExecucao({
  podeOperar,
  cards,
  uhIdsLiberadasHoje,
  commitmentHoje,
}: {
  podeOperar: boolean
  cards: CorrectionCardView[]
  uhIdsLiberadasHoje: string[]
  commitmentHoje: DailyCommitmentView | null
}) {
  const aFazer = useMemo(
    () => cards.filter((c) => c.executionStatus === 'A_FAZER' && uhIdsLiberadasHoje.includes(c.uhId)),
    [cards, uhIdsLiberadasHoje],
  )
  const planejadas = useMemo(
    () => (commitmentHoje?.cards ?? []).filter((c) => c.executionStatus === 'PLANEJADA'),
    [commitmentHoje],
  )
  const executadas = useMemo(
    () => (commitmentHoje?.cards ?? []).filter((c) => c.executionStatus === 'EXECUTADA'),
    [commitmentHoje],
  )

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [blockMap, setBlockMap] = useState<Record<string, boolean>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [fechando, setFechando] = useState(false)
  const [cardExecutando, setCardExecutando] = useState<{ id: string; uhName: string; checklistItemName: string | null } | null>(null)

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function confirmarFechamento() {
    setFechando(true)
    try {
      unwrapSafeAction(
        await fecharProgramacaoDiaAction({
          cardIds: Array.from(selecionados),
          blockMap,
        }),
      )
      toast.success('Programação do dia fechada.')
      setSelecionados(new Set())
      setBlockMap({})
      setConfirmando(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao fechar a programação.')
    } finally {
      setFechando(false)
    }
  }

  const selecionadosArr = aFazer.filter((c) => selecionados.has(c.id))

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">A Fazer</h3>
            <span className="text-xs text-muted-foreground">({aFazer.length})</span>
          </div>

          {commitmentHoje ? (
            <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              A programação de hoje já foi fechada. Novos cards liberados hoje entram amanhã.
            </p>
          ) : aFazer.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum item pendente de UH liberada pra limpeza hoje.
            </p>
          ) : (
            <>
              {aFazer.map((card) => (
                <div key={card.id} className="rounded-xl border border-border/70 bg-background p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selecionados.has(card.id)}
                      disabled={!podeOperar}
                      onChange={() => alternarSelecao(card.id)}
                    />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          Unidade {card.uhName}
                          {card.urgente && (
                            <span className="flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              <Siren className="h-2.5 w-2.5" />
                              Urgente
                            </span>
                          )}
                        </p>
                        {card.checklistItemCategory && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            style={{ borderColor: corCategoria(card.checklistItemCategory), color: corCategoria(card.checklistItemCategory) }}
                          >
                            {card.checklistItemCategory}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{card.checklistItemName ?? 'Item removido do catálogo'}</p>
                      {card.comment && <p className="text-xs text-muted-foreground">{card.comment}</p>}
                    </div>
                  </label>
                  {selecionados.has(card.id) && (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-1.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Bloquear UH pra reservas?
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={blockMap[card.id] ? 'default' : 'outline'}
                          className="h-6 rounded-lg px-2 text-xs"
                          onClick={() => setBlockMap((m) => ({ ...m, [card.id]: true }))}
                        >
                          Sim
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={!blockMap[card.id] ? 'default' : 'outline'}
                          className="h-6 rounded-lg px-2 text-xs"
                          onClick={() => setBlockMap((m) => ({ ...m, [card.id]: false }))}
                        >
                          Não
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <Button
                className="w-full rounded-xl"
                disabled={!podeOperar || selecionados.size === 0}
                onClick={() => setConfirmando(true)}
              >
                <ListChecks className="h-3.5 w-3.5" />
                Fechar programação do dia ({selecionados.size})
              </Button>
            </>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Planejadas</h3>
            <span className="text-xs text-muted-foreground">({planejadas.length})</span>
          </div>
          {planejadas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item planejado pra hoje ainda.</p>
          ) : (
            planejadas.map((card) => (
              <div key={card.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  Unidade {card.uhName}
                  {card.urgente && (
                    <span className="flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      <Siren className="h-2.5 w-2.5" />
                      Urgente
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{card.checklistItemName ?? 'Item removido do catálogo'}</p>
                <Button
                  size="sm"
                  className="mt-3 w-full rounded-xl"
                  disabled={!podeOperar}
                  title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                  onClick={() => setCardExecutando(card)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Marcar como executada
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
            <h3 className="text-sm font-semibold">Executadas</h3>
            <span className="text-xs text-muted-foreground">({executadas.length})</span>
          </div>
          {executadas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma execução ainda hoje.</p>
          ) : (
            executadas.map((card) => (
              <div key={card.id} className="rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/8 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  Unidade {card.uhName}
                  {card.urgente && (
                    <span className="flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      <Siren className="h-2.5 w-2.5" />
                      Urgente
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{card.checklistItemName ?? 'Item removido do catálogo'}</p>
                {card.executedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">Executado às {formatarHoraExecucao(card.executedAt)}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={confirmando} onOpenChange={(open) => !open && setConfirmando(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Fechar programação do dia</DialogTitle>
            <DialogDescription>
              Depois de fechada, não é possível reabrir a programação de hoje. Confirma os {selecionadosArr.length}{' '}
              {selecionadosArr.length === 1 ? 'item selecionado' : 'itens selecionados'}?
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {selecionadosArr.map((card) => (
              <div key={card.id} className="flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-1.5 text-sm">
                <span>
                  Unidade {card.uhName} — {card.checklistItemName ?? 'item'}
                </span>
                {blockMap[card.id] && (
                  <Badge variant="outline" className="text-[10px]">
                    Bloqueia UH
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={fechando} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={confirmarFechamento} disabled={fechando} className="rounded-xl">
              {fechando ? 'Fechando...' : 'Confirmar fechamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogExecutarCard card={cardExecutando} onClose={() => setCardExecutando(null)} />
    </>
  )
}

function DialogExecutarCard({
  card,
  onClose,
}: {
  card: { id: string; uhName: string; checklistItemName: string | null } | null
  onClose: () => void
}) {
  const [descricao, setDescricao] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [salvando, setSalvando] = useState(false)

  function fechar() {
    setDescricao('')
    setFotos([])
    onClose()
  }

  async function adicionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || fotos.length >= MAX_FOTOS_EXECUCAO) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pasta', 'correcao-execucao')
      fd.append('tipo', 'execucao')
      const res = await apiFetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Falha no upload.')
      const data = await res.json()
      setFotos((f) => [...f, data.url as string])
    } catch {
      toast.error('Não foi possível enviar a foto.')
    } finally {
      setUploading(false)
    }
  }

  async function confirmar() {
    if (!card || descricao.trim().length < 5) return
    setSalvando(true)
    try {
      unwrapSafeAction(await executarCardExecucaoAction({ cardId: card.id, description: descricao.trim(), photos: fotos }))
      toast.success('Item executado — IV voltou a Conforme.')
      fechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar a execução.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Marcar como executada</DialogTitle>
          <DialogDescription>
            {card ? `Unidade ${card.uhName} — ${card.checklistItemName ?? 'item'}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">O que foi feito? *</p>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o serviço realizado"
              className="min-h-20 rounded-xl"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Fotos (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {fotos.map((url) => (
                <div key={url} className="h-16 w-16 overflow-hidden rounded-lg border border-border/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Evidência" className="h-full w-full object-cover" />
                </div>
              ))}
              {fotos.length < MAX_FOTOS_EXECUCAO && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-accent">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={adicionarFoto} />
                </label>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={fechar} disabled={salvando} className="rounded-xl">
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando || descricao.trim().length < 5} className="rounded-xl">
            {salvando ? 'Salvando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
