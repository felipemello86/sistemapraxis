'use client'

import { useState } from 'react'
import { Camera, Loader2, Package, ShoppingCart, Siren } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { corCategoria, formatarData } from '@/lib/domain'
import { comprarMaterialAction } from '@/app/actions/correcao'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import type { CorrectionCardView } from '@/lib/types'

// Kanban "Aquisição" — só cards com needsMaterial=true (podem também
// precisar de serviço externo; nesse caso aparecem também em Serviços
// Externos, ver comentário em correcao.tsx). Colunas: A Adquirir / Comprado
// — mover pra Comprado exige o cupom fiscal (obrigatório, pedido explícito).

function CardResumo({ card }: { card: CorrectionCardView }) {
  return (
    <div className="space-y-1.5">
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
  )
}

export function KanbanAquisicao({ podeOperar, cards }: { podeOperar: boolean; cards: CorrectionCardView[] }) {
  const aAdquirir = cards.filter((c) => c.materialStatus === 'A_ADQUIRIR')
  const comprados = cards.filter((c) => c.materialStatus === 'COMPRADO')

  const [cardComprando, setCardComprando] = useState<CorrectionCardView | null>(null)
  const [cupomUrl, setCupomUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function handleCupom(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pasta', 'correcao-aquisicao')
      fd.append('tipo', 'cupom-fiscal')
      const res = await apiFetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Falha no upload.')
      const data = await res.json()
      setCupomUrl(data.url as string)
    } catch {
      toast.error('Não foi possível enviar o cupom fiscal.')
    } finally {
      setUploading(false)
    }
  }

  async function confirmarCompra() {
    if (!cardComprando || !cupomUrl) return
    setSalvando(true)
    try {
      unwrapSafeAction(await comprarMaterialAction({ cardId: cardComprando.id, receiptPhotoUrl: cupomUrl }))
      toast.success('Material marcado como comprado.')
      setCardComprando(null)
      setCupomUrl(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar a compra.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">A Adquirir</h3>
            <span className="text-xs text-muted-foreground">({aAdquirir.length})</span>
          </div>
          {aAdquirir.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nada pendente de aquisição.</p>
          ) : (
            aAdquirir.map((card) => (
              <div key={card.id} className="rounded-xl border border-border/70 bg-background p-3">
                <CardResumo card={card} />
                <Button
                  size="sm"
                  className="mt-3 w-full rounded-xl"
                  disabled={!podeOperar}
                  title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                  onClick={() => {
                    setCardComprando(card)
                    setCupomUrl(null)
                  }}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Marcar como comprado
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-[var(--success)]" />
            <h3 className="text-sm font-semibold">Comprado</h3>
            <span className="text-xs text-muted-foreground">({comprados.length})</span>
          </div>
          {comprados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum material comprado ainda.</p>
          ) : (
            comprados.map((card) => (
              <div key={card.id} className="rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/8 p-3">
                <CardResumo card={card} />
                {card.materialCompradoEm && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Comprado em {formatarData(card.materialCompradoEm)}
                  </p>
                )}
                {card.needsExternalService && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aguardando também o fluxo de Serviços Externos.
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={cardComprando !== null} onOpenChange={(open) => !open && setCardComprando(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Marcar material como comprado</DialogTitle>
            <DialogDescription>
              Anexe a foto do cupom fiscal — obrigatório pra concluir esta etapa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {cupomUrl ? (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cupomUrl} alt="Cupom fiscal" className="h-full w-full object-cover" />
              </div>
            ) : (
              <label className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-accent">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-xs">Anexar cupom fiscal</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleCupom}
                />
              </label>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCardComprando(null)} disabled={salvando} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={confirmarCompra} disabled={!cupomUrl || salvando} className="rounded-xl">
              {salvando ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
