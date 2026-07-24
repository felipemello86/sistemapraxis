'use client'

import { useMemo, useState } from 'react'
import {
  Camera,
  Check,
  ChevronRight,
  History,
  Loader2,
  Phone,
  Plus,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { formatarData } from '@/lib/domain'
import { agendarServicoAction, executarServicoAction, registrarCotacaoAction } from '@/app/actions/correcao'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import { CorrectionCardHeader } from '@/components/views/correction-card-header'
import type { CorrectionCardView, SupplierView } from '@/lib/types'

const MAX_FOTOS_EXECUCAO = 4

// Kanban "Serviços Externos" — só cards com needsExternalService=true
// (podem também precisar de material; nesse caso aparecem também em
// Aquisição, cada frente avançando independente — ver correcao.tsx). Ao
// chegar em "Executado", o IV volta a Conforme automaticamente
// (resolveCorrectionCard, chamado pela Server Action).

function CardHeader({
  card,
  temReserva,
  liberada,
  onVerDetalhe,
}: {
  card: CorrectionCardView
  temReserva: boolean
  liberada: boolean
  onVerDetalhe: (card: CorrectionCardView) => void
}) {
  return (
    <CorrectionCardHeader card={card} temReserva={temReserva} liberada={liberada} onVerDetalhe={onVerDetalhe}>
      {card.needsMaterial && (
        <p className="text-xs text-muted-foreground">
          Material: {card.materialStatus === 'COMPRADO' ? 'já comprado' : 'ainda não comprado'}
        </p>
      )}
    </CorrectionCardHeader>
  )
}

export function KanbanServicos({
  podeOperar,
  cards,
  suppliers,
  uhIdsComReservaHoje,
  uhIdsLiberadasHoje,
  onVerDetalhe,
}: {
  podeOperar: boolean
  cards: CorrectionCardView[]
  suppliers: SupplierView[]
  uhIdsComReservaHoje: string[]
  uhIdsLiberadasHoje: string[]
  onVerDetalhe: (card: CorrectionCardView) => void
}) {
  const aContratar = cards.filter((c) => c.externalServiceStatus === 'A_CONTRATAR')
  const emNegociacao = cards.filter((c) => c.externalServiceStatus === 'EM_NEGOCIACAO')
  const agendado = cards.filter((c) => c.externalServiceStatus === 'AGENDADO')
  const executado = cards.filter((c) => c.externalServiceStatus === 'EXECUTADO')

  const [cardCotando, setCardCotando] = useState<CorrectionCardView | null>(null)
  const [cardAgendando, setCardAgendando] = useState<CorrectionCardView | null>(null)
  const [cardExecutando, setCardExecutando] = useState<CorrectionCardView | null>(null)

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Coluna titulo="A contratar" total={aContratar.length}>
          {aContratar.map((card) => (
            <div key={card.id} className="rounded-xl border border-border/70 bg-background p-3">
              <CardHeader
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
                onClick={() => setCardCotando(card)}
              >
                <Plus className="h-3.5 w-3.5" />
                Registrar fornecedor
              </Button>
            </div>
          ))}
        </Coluna>

        <Coluna titulo="Em negociação" total={emNegociacao.length}>
          {emNegociacao.map((card) => (
            <div key={card.id} className="rounded-xl border border-border/70 bg-background p-3">
              <CardHeader
                card={card}
                temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                onVerDetalhe={onVerDetalhe}
              />
              {card.quotes.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {card.quotes.map((q) => (
                    <li key={q.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      {q.supplierNome}
                    </li>
                  ))}
                </ul>
              )}
              {card.quotes.length < 3 && (
                <p className="mt-2 text-[11px] italic text-muted-foreground">
                  Recomendação: cotar com pelo menos 3 fornecedores antes de agendar (não obrigatório).
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  disabled={!podeOperar}
                  onClick={() => setCardCotando(card)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Mais um
                </Button>
                <Button
                  size="sm"
                  className="flex-1 rounded-xl"
                  disabled={!podeOperar}
                  title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                  onClick={() => setCardAgendando(card)}
                >
                  Agendar
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </Coluna>

        <Coluna titulo="Agendado" total={agendado.length}>
          {agendado.map((card) => (
            <div key={card.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <CardHeader
                card={card}
                temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                onVerDetalhe={onVerDetalhe}
              />
              <div className="mt-2 rounded-lg bg-background/70 p-2 text-xs">
                <p className="font-medium">{card.hiredSupplierNome}</p>
                {card.scheduledDate && <p className="text-muted-foreground">{formatarData(card.scheduledDate)}</p>}
              </div>
              {card.schedulingLogs.length > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <History className="h-3 w-3" />
                  Reagendado {card.schedulingLogs.length}x
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  disabled={!podeOperar}
                  onClick={() => setCardAgendando(card)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 rounded-xl"
                  disabled={!podeOperar}
                  title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                  onClick={() => setCardExecutando(card)}
                >
                  <Check className="h-3.5 w-3.5" />
                  Executado
                </Button>
              </div>
            </div>
          ))}
        </Coluna>

        <Coluna titulo="Executado" total={executado.length}>
          {executado.map((card) => (
            <div key={card.id} className="rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/8 p-3">
              <CardHeader
                card={card}
                temReserva={uhIdsComReservaHoje.includes(card.uhId)}
                liberada={uhIdsLiberadasHoje.includes(card.uhId)}
                onVerDetalhe={onVerDetalhe}
              />
              {card.executedDescription && <p className="mt-2 text-xs">{card.executedDescription}</p>}
            </div>
          ))}
        </Coluna>
      </div>

      <DialogCotacao
        card={cardCotando}
        suppliers={suppliers}
        onClose={() => setCardCotando(null)}
      />
      <DialogAgendar card={cardAgendando} onClose={() => setCardAgendando(null)} />
      <DialogExecutarServico card={cardExecutando} onClose={() => setCardExecutando(null)} />
    </>
  )
}

function Coluna({ titulo, total, children }: { titulo: string; total: number; children: React.ReactNode }) {
  return (
    <div className="flex max-h-[75vh] flex-col rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Truck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <span className="text-xs text-muted-foreground">({total})</span>
      </div>
      <div className="space-y-3 overflow-y-auto pr-1">
        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada aqui no momento.</p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function DialogCotacao({
  card,
  suppliers,
  onClose,
}: {
  card: CorrectionCardView | null
  suppliers: SupplierView[]
  onClose: () => void
}) {
  const [modo, setModo] = useState<'existente' | 'novo'>('existente')
  const [supplierId, setSupplierId] = useState('')
  const [nome, setNome] = useState('')
  const [contato, setContato] = useState('')
  const [salvando, setSalvando] = useState(false)

  const sugeridos = useMemo(() => {
    if (!card?.checklistItemId) return suppliers
    const idsJaCotados = new Set(card.quotes.map((q) => q.supplierId))
    const usados = suppliers.filter((s) => s.checklistItemIds.includes(card.checklistItemId!) && !idsJaCotados.has(s.id))
    const outros = suppliers.filter((s) => !usados.includes(s) && !idsJaCotados.has(s.id))
    return [...usados, ...outros]
  }, [card, suppliers])

  function fechar() {
    setModo('existente')
    setSupplierId('')
    setNome('')
    setContato('')
    onClose()
  }

  async function confirmar() {
    if (!card) return
    if (modo === 'existente' && !supplierId) return
    if (modo === 'novo' && !nome.trim()) return
    setSalvando(true)
    try {
      unwrapSafeAction(
        await registrarCotacaoAction(
          modo === 'existente'
            ? { cardId: card.id, supplierId }
            : { cardId: card.id, novoFornecedor: { nome: nome.trim(), contato: contato.trim() || undefined } },
        ),
      )
      toast.success('Fornecedor registrado na negociação.')
      fechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar fornecedor.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar fornecedor</DialogTitle>
          <DialogDescription>
            {card ? `Unidade ${card.uhName} — ${card.checklistItemName ?? 'item'}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={modo === 'existente' ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setModo('existente')}
            >
              Fornecedor existente
            </Button>
            <Button
              type="button"
              size="sm"
              variant={modo === 'novo' ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setModo('novo')}
            >
              Cadastrar novo
            </Button>
          </div>

          {modo === 'existente' ? (
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {sugeridos.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum fornecedor cadastrado ainda.</p>
              )}
              {sugeridos.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSupplierId(s.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    supplierId === s.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                  }`}
                >
                  <span>
                    {s.nome}
                    {card?.checklistItemId && s.checklistItemIds.includes(card.checklistItemId) && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">já usado nesse tipo de item</span>
                    )}
                  </span>
                  {s.contato && <span className="text-xs text-muted-foreground">{s.contato}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <Input placeholder="Nome do fornecedor *" value={nome} onChange={(e) => setNome(e.target.value)} />
              <Input placeholder="Contato (telefone/WhatsApp)" value={contato} onChange={(e) => setContato(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={fechar} disabled={salvando} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={salvando || (modo === 'existente' ? !supplierId : !nome.trim())}
            className="rounded-xl"
          >
            {salvando ? 'Salvando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogAgendar({ card, onClose }: { card: CorrectionCardView | null; onClose: () => void }) {
  const [supplierId, setSupplierId] = useState(card?.hiredSupplierId ?? '')
  const [data, setData] = useState(card?.scheduledDate ? card.scheduledDate.slice(0, 10) : '')
  const [salvando, setSalvando] = useState(false)

  const bloqueadoPorMaterial = !!card?.needsMaterial && card.materialStatus !== 'COMPRADO'

  function fechar() {
    setSupplierId('')
    setData('')
    onClose()
  }

  async function confirmar() {
    if (!card || !supplierId || !data) return
    setSalvando(true)
    try {
      unwrapSafeAction(await agendarServicoAction({ cardId: card.id, supplierId, date: data }))
      toast.success('Serviço agendado.')
      fechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao agendar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) fechar()
        else {
          setSupplierId(card?.hiredSupplierId ?? '')
          setData(card?.scheduledDate ? card.scheduledDate.slice(0, 10) : '')
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Agendar serviço</DialogTitle>
          <DialogDescription>
            {card ? `Unidade ${card.uhName} — ${card.checklistItemName ?? 'item'}` : ''}
          </DialogDescription>
        </DialogHeader>
        {bloqueadoPorMaterial ? (
          <p className="rounded-xl bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]">
            Compre o material desse card na aba Aquisição antes de agendar o serviço.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Fornecedor contratado *</p>
              <div className="space-y-1.5">
                {(card?.quotes ?? []).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSupplierId(q.supplierId)}
                    className={`flex w-full items-center rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      supplierId === q.supplierId ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                    }`}
                  >
                    {q.supplierNome}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Dia do serviço *</p>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={fechar} disabled={salvando} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={salvando || bloqueadoPorMaterial || !supplierId || !data}
            className="rounded-xl"
          >
            {salvando ? 'Salvando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogExecutarServico({ card, onClose }: { card: CorrectionCardView | null; onClose: () => void }) {
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
      fd.append('pasta', 'correcao-servicos')
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
      unwrapSafeAction(await executarServicoAction({ cardId: card.id, description: descricao.trim(), photos: fotos }))
      toast.success('Serviço concluído — item voltou a Conforme.')
      fechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao concluir o serviço.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Concluir serviço externo</DialogTitle>
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
