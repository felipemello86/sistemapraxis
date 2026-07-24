'use client'

import { useMemo, useState } from 'react'
import { Camera, CheckCircle2, ClipboardList, Inbox, Lock, Loader2, ListChecks, Plus } from 'lucide-react'
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
import {
  adicionarCardUrgenteAction,
  executarCardExecucaoAction,
  fecharProgramacaoDiaAction,
  triarCardAProcessarAction,
} from '@/app/actions/correcao'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import { CorrectionCardHeader } from '@/components/views/correction-card-header'
import type { CorrectionCardView, DailyCommitmentView } from '@/lib/types'

const MAX_FOTOS_EXECUCAO = 4

function formatarHoraExecucao(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

// Kanban "Execução" — 4 colunas. "A Processar": cards sem triagem, criados
// pelo módulo Governança (camareira/governanta/flag de manutenção), que não
// pergunta Material/Serviço Externo — cabe ao perfil Manutenção classificar
// daqui (ver triarCardAProcessarAction). Depois de triado, o card sai desta
// coluna e entra no filtro normal (Aquisição/Serviços/"A Fazer" aqui mesmo,
// ver correcao.tsx). "A Fazer" só mostra cards sem serviço externo (e, se
// precisar material, já comprado) de UHs SELECIONADAS pra hoje na
// Governança (Seleção e Liberação) — não precisa estar liberada ainda, a
// seleção do dia precede a liberação (pedido explícito: o técnico deve ver
// o card assim que a UH entra na programação do dia). Selecionar cards aqui + "Fechar
// programação do dia" cria o MaintenanceDailyCommitment de hoje (um por
// dia, não pode reabrir) — só a partir daí os cards viram "Planejadas". Com
// o dia já fechado, cards intempestivos/urgentes que ainda apareceriam em
// "A Fazer" podem ser adicionados direto em "Planejadas" (marcados
// previsto=false, não contam no denominador do % de realização — ver
// adicionarCardUrgenteAction). "Executadas" volta o IV a Conforme
// automaticamente (resolveCorrectionCard, na Server Action).

export function KanbanExecucao({
  podeOperar,
  cards,
  cardsAProcessar,
  uhIdsSelecionadasHoje,
  uhIdsComReservaHoje,
  uhIdsLiberadasHoje,
  commitmentHoje,
  onVerDetalhe,
}: {
  podeOperar: boolean
  cards: CorrectionCardView[]
  cardsAProcessar: CorrectionCardView[]
  uhIdsSelecionadasHoje: string[]
  uhIdsComReservaHoje: string[]
  uhIdsLiberadasHoje: string[]
  commitmentHoje: DailyCommitmentView | null
  onVerDetalhe: (card: CorrectionCardView) => void
}) {
  const aFazer = useMemo(
    () => cards.filter((c) => c.executionStatus === 'A_FAZER' && uhIdsSelecionadasHoje.includes(c.uhId)),
    [cards, uhIdsSelecionadasHoje],
  )
  // Filtra os cards completos (CorrectionCardView, com categoria/comentário/
  // fotos etc.) pelo commitment de hoje, em vez de usar o "cards" resumido
  // de DailyCommitmentView (que só tem uhName/checklistItemName/urgente/
  // previsto — não dá pra mostrar o popup de detalhamento nem o badge de
  // Reserva com esse resumo). dailyCommitmentId identifica sem ambiguidade
  // a qual fechamento de dia o card pertence.
  const planejadas = useMemo(
    () => cards.filter((c) => c.executionStatus === 'PLANEJADA' && c.dailyCommitmentId === commitmentHoje?.id),
    [cards, commitmentHoje],
  )
  const executadas = useMemo(
    () => cards.filter((c) => c.executionStatus === 'EXECUTADA' && c.dailyCommitmentId === commitmentHoje?.id),
    [cards, commitmentHoje],
  )

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [blockMap, setBlockMap] = useState<Record<string, boolean>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [fechando, setFechando] = useState(false)
  const [cardExecutando, setCardExecutando] = useState<{ id: string; uhName: string; checklistItemName: string | null } | null>(null)
  const [cardTriando, setCardTriando] = useState<CorrectionCardView | null>(null)
  const [adicionandoUrgente, setAdicionandoUrgente] = useState<string | null>(null)
  // Igual ao blockMap do fechamento normal (abaixo) — só que aqui é por
  // card individual, já que "Adicionar à programação de hoje" não passa
  // pela seleção múltipla. Ver comentário no botão.
  const [selecionandoUrgente, setSelecionandoUrgente] = useState<string | null>(null)
  const [blockUrgente, setBlockUrgente] = useState<Record<string, boolean>>({})

  async function adicionarUrgente(cardId: string) {
    setAdicionandoUrgente(cardId)
    try {
      unwrapSafeAction(await adicionarCardUrgenteAction({ cardId, block: blockUrgente[cardId] ?? false }))
      toast.success('Card adicionado à programação de hoje.')
      setSelecionandoUrgente(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar o card.')
    } finally {
      setAdicionandoUrgente(null)
    }
  }

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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">A Processar</h3>
            <span className="text-xs text-muted-foreground">({cardsAProcessar.length})</span>
          </div>
          <div className="space-y-3 overflow-y-auto pr-1">
            {cardsAProcessar.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada aguardando classificação.</p>
            ) : (
              cardsAProcessar.map((card) => (
                <div key={card.id} className="rounded-xl border border-border/70 bg-background p-3">
                  <CorrectionCardHeader
                    card={card}
                    temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                    liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                    onVerDetalhe={onVerDetalhe}
                  />
                  <Button
                    size="sm"
                    className="mt-3 w-full rounded-xl"
                    disabled={!podeOperar}
                    title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                    onClick={() => setCardTriando(card)}
                  >
                    Classificar
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">A Fazer</h3>
            <span className="text-xs text-muted-foreground">({aFazer.length})</span>
          </div>

          {commitmentHoje ? (
            aFazer.length === 0 ? (
              <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                A programação de hoje já foi fechada. Nenhum card intempestivo pendente.
              </p>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-1">
                <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  A programação de hoje já foi fechada. Estes cards surgiram depois — adicione à programação se for
                  urgente, ou deixe pra amanhã.
                </p>
                {aFazer.map((card) => {
                  const expandido = selecionandoUrgente === card.id
                  return (
                    <div key={card.id} className="rounded-xl border border-border/70 bg-background p-3">
                      <CorrectionCardHeader
                        card={card}
                        temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                        liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                        onVerDetalhe={onVerDetalhe}
                      />
                      {expandido ? (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-1.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              Bloquear UH pra reservas?
                            </span>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant={blockUrgente[card.id] ? 'default' : 'outline'}
                                className="h-6 rounded-lg px-2 text-xs"
                                onClick={() => setBlockUrgente((m) => ({ ...m, [card.id]: true }))}
                              >
                                Sim
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={!blockUrgente[card.id] ? 'default' : 'outline'}
                                className="h-6 rounded-lg px-2 text-xs"
                                onClick={() => setBlockUrgente((m) => ({ ...m, [card.id]: false }))}
                              >
                                Não
                              </Button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 rounded-xl"
                              disabled={adicionandoUrgente === card.id}
                              onClick={() => setSelecionandoUrgente(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 rounded-xl"
                              disabled={adicionandoUrgente === card.id}
                              onClick={() => adicionarUrgente(card.id)}
                            >
                              {adicionandoUrgente === card.id ? 'Adicionando...' : 'Confirmar'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 w-full rounded-xl"
                          disabled={!podeOperar}
                          title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                          onClick={() => {
                            setSelecionandoUrgente(card.id)
                            setBlockUrgente((m) => ({ ...m, [card.id]: false }))
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar à programação de hoje
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : aFazer.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum item pendente de UH selecionada pra hoje.
            </p>
          ) : (
            <>
              <div className="space-y-3 overflow-y-auto pr-1">
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
                    <div className="flex-1">
                      <CorrectionCardHeader
                        card={card}
                        temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                        liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                        onVerDetalhe={onVerDetalhe}
                      />
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
              </div>

              <Button
                className="mt-3 w-full shrink-0 rounded-xl"
                disabled={!podeOperar || selecionados.size === 0}
                onClick={() => setConfirmando(true)}
              >
                <ListChecks className="h-3.5 w-3.5" />
                Fechar programação do dia ({selecionados.size})
              </Button>
            </>
          )}
        </div>

        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Planejadas</h3>
            <span className="text-xs text-muted-foreground">({planejadas.length})</span>
          </div>
          <div className="space-y-3 overflow-y-auto pr-1">
            {planejadas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item planejado pra hoje ainda.</p>
            ) : (
              planejadas.map((card) => (
                <div key={card.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <CorrectionCardHeader
                    card={card}
                    temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                    liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                    onVerDetalhe={onVerDetalhe}
                    extraBadge={
                      !card.previsto && (
                        <span className="flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                          <Plus className="h-2.5 w-2.5" />
                          Não previsto
                        </span>
                      )
                    }
                  />
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
        </div>

        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
            <h3 className="text-sm font-semibold">Executadas</h3>
            <span className="text-xs text-muted-foreground">({executadas.length})</span>
          </div>
          <div className="space-y-3 overflow-y-auto pr-1">
            {executadas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma execução ainda hoje.</p>
            ) : (
              executadas.map((card) => (
                <div key={card.id} className="rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/8 p-3">
                  <CorrectionCardHeader
                    card={card}
                    temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                    liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                    onVerDetalhe={onVerDetalhe}
                    extraBadge={
                      !card.previsto && (
                        <span className="flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                          <Plus className="h-2.5 w-2.5" />
                          Não previsto
                        </span>
                      )
                    }
                  />
                  {card.executedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">Executado às {formatarHoraExecucao(card.executedAt)}</p>
                  )}
                </div>
              ))
            )}
          </div>
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
      <DialogTriarCard card={cardTriando} onClose={() => setCardTriando(null)} />
    </>
  )
}

function DialogTriarCard({ card, onClose }: { card: CorrectionCardView | null; onClose: () => void }) {
  const [needsMaterial, setNeedsMaterial] = useState<boolean | null>(null)
  const [needsExternalService, setNeedsExternalService] = useState<boolean | null>(null)
  const [salvando, setSalvando] = useState(false)

  function fechar() {
    setNeedsMaterial(null)
    setNeedsExternalService(null)
    onClose()
  }

  async function confirmar() {
    if (!card || needsMaterial === null || needsExternalService === null) return
    setSalvando(true)
    try {
      unwrapSafeAction(await triarCardAProcessarAction({ cardId: card.id, needsMaterial, needsExternalService }))
      toast.success('Card classificado.')
      fechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao classificar o card.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Classificar necessidade de manutenção</DialogTitle>
          <DialogDescription>
            {card ? `Unidade ${card.uhName} — ${card.checklistItemName ?? 'item'}` : ''}
          </DialogDescription>
        </DialogHeader>
        {card?.comment && (
          <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">{card.comment}</p>
        )}
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Precisa de material/peça?</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={needsMaterial === true ? 'default' : 'outline'}
                className="flex-1 rounded-xl"
                onClick={() => setNeedsMaterial(true)}
              >
                Sim
              </Button>
              <Button
                type="button"
                size="sm"
                variant={needsMaterial === false ? 'default' : 'outline'}
                className="flex-1 rounded-xl"
                onClick={() => setNeedsMaterial(false)}
              >
                Não
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Precisa de serviço externo?</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={needsExternalService === true ? 'default' : 'outline'}
                className="flex-1 rounded-xl"
                onClick={() => setNeedsExternalService(true)}
              >
                Sim
              </Button>
              <Button
                type="button"
                size="sm"
                variant={needsExternalService === false ? 'default' : 'outline'}
                className="flex-1 rounded-xl"
                onClick={() => setNeedsExternalService(false)}
              >
                Não
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={fechar} disabled={salvando} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={salvando || needsMaterial === null || needsExternalService === null}
            className="rounded-xl"
          >
            {salvando ? 'Salvando...' : 'Confirmar classificação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
