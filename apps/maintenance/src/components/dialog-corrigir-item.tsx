'use client'

import { useState } from 'react'
import { Camera, Loader2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { corrigirItemAction } from '@/app/actions/correcao'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'

const MAX_FOTOS_CORRIGIR = 4

// Popup compartilhado do botão "Corrigir" — disponível em Visão Gerencial,
// Inspeções e UH 3D (pedido explícito do Felipe: exige texto descritivo da
// correção, fotos opcionais). Resolve a NC direto a partir do inspectionItemId,
// sem depender de em que kanban/coluna o card de Correção dela esteja — ver
// corrigirItemAction / corrigirItemDireto.

export function DialogCorrigirItem({
  item,
  onClose,
}: {
  item: { inspectionItemId: string; uhName: string; itemName: string | null } | null
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
    if (!file || fotos.length >= MAX_FOTOS_CORRIGIR) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pasta', 'correcao-item')
      fd.append('tipo', 'correcao')
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
    if (!item || descricao.trim().length < 5) return
    setSalvando(true)
    try {
      unwrapSafeAction(
        await corrigirItemAction({
          inspectionItemId: item.inspectionItemId,
          description: descricao.trim(),
          photos: fotos,
        }),
      )
      toast.success('Item corrigido — voltou a Conforme.')
      fechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar a correção.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Wrench className="h-4 w-4" />
            Corrigir
          </DialogTitle>
          <DialogDescription>
            {item ? `Unidade ${item.uhName}${item.itemName ? ` — ${item.itemName}` : ''}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">O que foi feito? *</p>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva a correção realizada"
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
              {fotos.length < MAX_FOTOS_CORRIGIR && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-accent">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={uploading}
                    onChange={adicionarFoto}
                  />
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
            {salvando ? 'Salvando...' : 'Confirmar correção'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
