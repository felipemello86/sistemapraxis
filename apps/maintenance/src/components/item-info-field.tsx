'use client'

import { useEffect, useState, useTransition } from 'react'
import { Camera, ChevronDown, History, Loader2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatarData } from '@/lib/domain'
import { salvarInfoItemAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import type { ItemInfoLogEntry } from '@/lib/types'

const MAX_FOTOS_INFO = 4

// Campo reaproveitado nos 4 lugares onde um IV (item de verificação) pode
// ser editado: UH 3D (spot), Inspeções (histórico do item), Rota de
// Correção (etapa de descrição) e Visão Gerencial (detalhe da não
// conformidade). Independente do status de conformidade — existe mesmo pra
// itens nunca inspecionados, por isso não fica dentro do fluxo de "editar
// status" de nenhuma dessas telas, com seu próprio botão de salvar. Ver
// comentário em MaintenanceItemInfo no schema Prisma.
export function ItemInfoField({
  uhId,
  checklistItemId,
  initialInfo,
  initialPhotos = [],
  podeOperar,
  logs = [],
  className,
  label = 'Informações do item',
  compact = false,
}: {
  uhId: string
  checklistItemId: string
  initialInfo: string | null
  initialPhotos?: string[]
  podeOperar: boolean
  logs?: ItemInfoLogEntry[]
  className?: string
  // Rótulo do campo — por padrão "Informações do item", mas telas onde ele
  // convive lado a lado com um campo de descrição de falha (ex.: UH 3D)
  // podem sobrescrever pra algo mais curto/neutro (ex.: "Cadastro"), pra não
  // ser confundido com a falha em si. Ver comentário no SpotDetailDialog.
  label?: string
  // Versão reduzida — mesma lógica acima: usado onde este campo precisa ter
  // presença visual de coadjuvante (menor, mais discreto), não de
  // protagonista da tela.
  compact?: boolean
}) {
  const [valor, setValor] = useState(initialInfo ?? '')
  const [fotos, setFotos] = useState<string[]>(initialPhotos)
  const [uploading, setUploading] = useState(false)
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)
  const [sujo, setSujo] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [salvando, startTransition] = useTransition()

  useEffect(() => {
    setValor(initialInfo ?? '')
    setFotos(initialPhotos)
    setSujo(false)
  }, [initialInfo, initialPhotos, uhId, checklistItemId])

  function marcarSujo(novoValor: string, novasFotos: string[]) {
    const mudouTexto = novoValor !== (initialInfo ?? '')
    const mudouFotos = JSON.stringify(novasFotos) !== JSON.stringify(initialPhotos)
    setSujo(mudouTexto || mudouFotos)
  }

  async function adicionarFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    const restante = MAX_FOTOS_INFO - fotos.length
    if (restante <= 0) {
      toast.error(`Máximo de ${MAX_FOTOS_INFO} fotos.`)
      return
    }
    const arquivos = Array.from(files).slice(0, restante)
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of arquivos) {
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`"${file.name}" é maior que 8MB — pulada.`)
          continue
        }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('pasta', `iv-uh/${uhId}`)
        fd.append('tipo', 'info-item')
        const res = await apiFetch('/api/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          let msg = `Falha no upload (HTTP ${res.status}).`
          try {
            const errBody = await res.json()
            if (errBody?.error) msg = errBody.error
          } catch {
            // resposta não era JSON — mantém a mensagem com o status.
          }
          throw new Error(msg)
        }
        const data = await res.json()
        urls.push(data.url as string)
      }
      const novasFotos = [...fotos, ...urls]
      setFotos(novasFotos)
      marcarSujo(valor, novasFotos)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a(s) foto(s).')
    } finally {
      setUploading(false)
    }
  }

  function removerFoto(url: string) {
    const novasFotos = fotos.filter((p) => p !== url)
    setFotos(novasFotos)
    marcarSujo(valor, novasFotos)
  }

  function salvar() {
    startTransition(async () => {
      try {
        unwrapSafeAction(await salvarInfoItemAction({ uhId, checklistItemId, info: valor, photos: fotos }))
        toast.success('Informações do item salvas.')
        setSujo(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar informações do item.')
      }
    })
  }

  const fotoSize = compact ? 'h-10 w-10' : 'h-16 w-16'

  return (
    <div className={className}>
      <label className={cn('mb-1.5 block font-medium text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
        {label}
      </label>
      <Textarea
        value={valor}
        onChange={(e) => {
          setValor(e.target.value)
          marcarSujo(e.target.value, fotos)
        }}
        placeholder="Ex.: potência, fabricante, número de série..."
        className={cn('rounded-xl', compact ? 'min-h-9 text-xs' : 'min-h-16')}
        disabled={!podeOperar || salvando}
      />

      <div className="mt-2 flex flex-wrap gap-2">
        {fotos.map((url) => (
          <div key={url} className={cn('group/foto relative overflow-hidden rounded-lg border border-border/70', fotoSize)}>
            <button
              type="button"
              onClick={() => setFotoAmpliada(url)}
              className="block h-full w-full"
              aria-label="Ver foto ampliada"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Foto do item" className="h-full w-full object-cover" />
            </button>
            {podeOperar && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removerFoto(url)
                }}
                className="absolute right-0.5 top-0.5 rounded-full bg-foreground/70 p-0.5 text-background opacity-0 transition-opacity group-hover/foto:opacity-100"
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {podeOperar && fotos.length < MAX_FOTOS_INFO && (
          <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-accent', fotoSize)}>
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Camera className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
                {!compact && <span className="text-[10px]">Adicionar</span>}
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              disabled={uploading || salvando}
              onChange={(e) => {
                adicionarFotos(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        {logs.length > 0 ? (
          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <History className="h-3 w-3" />
            Histórico de alterações ({logs.length})
            <ChevronDown className={cn('h-3 w-3 transition-transform', historicoAberto && 'rotate-180')} />
          </button>
        ) : (
          <span />
        )}
        {podeOperar && sujo && (
          <Button size="sm" onClick={salvar} disabled={salvando || uploading} className="rounded-lg">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        )}
      </div>
      {historicoAberto && logs.length > 0 && (
        <ul className="mt-2 space-y-1.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          {logs.map((l) => (
            <li key={l.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{l.authorName ?? 'Alguém'}</span>{' '}
              {l.previousInfo ? (
                <>
                  alterou de <span className="italic">&ldquo;{l.previousInfo}&rdquo;</span> para{' '}
                </>
              ) : (
                'preencheu com '
              )}
              {l.newInfo ? <span className="italic">&ldquo;{l.newInfo}&rdquo;</span> : <span className="italic">vazio</span>}
              {l.newPhotos.length !== l.previousPhotos.length && (
                <span> (fotos: {l.previousPhotos.length} → {l.newPhotos.length})</span>
              )}
              {' — '}
              {formatarData(l.createdAt)}
            </li>
          ))}
        </ul>
      )}

      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <button
            onClick={() => setFotoAmpliada(null)}
            aria-label="Fechar"
            style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
            className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoAmpliada} alt="Foto ampliada" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}
