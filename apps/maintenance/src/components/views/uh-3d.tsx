'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Check,
  X,
  Minus,
  Camera,
  Loader2,
  DoorOpen,
  BedDouble,
  ChefHat,
  ShowerHead,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { contarConformidade, itensParaUnidade, ultimaInspecaoPorUnidade } from '@/lib/domain'
import { editarSpotInspecaoAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import { ROOM_TYPES, ROOM_TYPE_LABELS } from '@/lib/types'
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  InspecaoComUnidade,
  InspectionItem,
  RoomType,
  UhImage,
  UhSpot,
  UnitOption,
} from '@/lib/types'

// Tela imersiva "UH 3D" (ver components/views/uh3d-config.tsx pro cadastro
// das fotos/spots que alimentam esta tela). Puramente client-side sobre os
// dados já carregados em page.tsx — nenhuma chamada de leitura própria, só a
// Server Action de edição do status do item (editarSpotInspecaoAction).

const MAX_FOTOS_EDICAO = 4

const ROOM_ICONS: Record<RoomType, typeof DoorOpen> = {
  porta: DoorOpen,
  quarto: BedDouble,
  cozinha: ChefHat,
  banheiro: ShowerHead,
}

type StatusSpot = 'CONFORME' | 'NAO_CONFORME' | 'NAO_AVALIADO'

export function Uh3D({
  podeOperar,
  unidades,
  itens,
  inspecoes,
  atribuicoes,
  uhImages,
  uhSpots,
}: {
  podeOperar: boolean
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  atribuicoes: AtribuicoesPorUnidade
  uhImages: UhImage[]
  uhSpots: UhSpot[]
}) {
  const [uhId, setUhId] = useState<string>(unidades[0]?.id ?? '')
  const [uhDropdownOpen, setUhDropdownOpen] = useState(false)
  const [currentRoom, setCurrentRoom] = useState<RoomType>('porta')
  const [detailSpot, setDetailSpot] = useState<UhSpot | null>(null)

  const itemPorId = useMemo(() => new Map(itens.map((it) => [it.id, it])), [itens])
  const ultimaMap = useMemo(() => ultimaInspecaoPorUnidade(inspecoes), [inspecoes])

  const unidadeAtual = useMemo(() => unidades.find((u) => u.id === uhId) ?? null, [unidades, uhId])
  const ultimaInsp = uhId ? ultimaMap.get(uhId) : undefined

  // Status por item de checklist, tirado da última inspeção da UH — ausência
  // de entrada significa "ainda não avaliado" (item nunca entrou numa
  // inspeção, ou a UH nunca foi inspecionada).
  const statusPorItem = useMemo(() => {
    const m = new Map<string, InspectionItem>()
    if (ultimaInsp) for (const it of ultimaInsp.items) if (it.checklistItemId) m.set(it.checklistItemId, it)
    return m
  }, [ultimaInsp])

  const imagensDaUh = useMemo(() => uhImages.filter((i) => i.uhId === uhId), [uhImages, uhId])
  const imagemPorTipo = useMemo(() => {
    const m = new Map<RoomType, UhImage>()
    for (const img of imagensDaUh) m.set(img.tipo as RoomType, img)
    return m
  }, [imagensDaUh])
  const roomsDisponiveis = useMemo(
    () => ROOM_TYPES.filter((t) => imagemPorTipo.has(t)),
    [imagemPorTipo],
  )
  // Itens ainda atribuídos a esta UH — um spot cujo item foi desatribuído
  // depois de criado (ver atribuicoes) some da tela, mesmo que o registro
  // continue no cadastro (Configurações → UH 3D é quem cuida de removê-lo).
  const idsAplicaveis = useMemo(() => {
    const ids = uhId ? itensParaUnidade(uhId, itens, atribuicoes) : []
    return new Set(ids.map((it) => it.id))
  }, [uhId, itens, atribuicoes])

  const imagemAtual = imagemPorTipo.get(currentRoom)
  const spotsDaImagem = useMemo(
    () =>
      imagemAtual
        ? uhSpots.filter((s) => s.imageId === imagemAtual.id && idsAplicaveis.has(s.checklistItemId))
        : [],
    [uhSpots, imagemAtual, idsAplicaveis],
  )

  const conformidade = ultimaInsp ? contarConformidade(ultimaInsp) : null
  const percentual = conformidade && conformidade.total > 0 ? Math.round((conformidade.ok / conformidade.total) * 100) : null

  // Ao trocar de UH, volta sempre pra "porta" (ou o primeiro cômodo
  // disponível, se não houver foto da porta cadastrada ainda).
  useEffect(() => {
    const imgs = uhImages.filter((i) => i.uhId === uhId)
    const disponiveis = ROOM_TYPES.filter((t) => imgs.some((i) => i.tipo === t))
    setCurrentRoom(disponiveis.includes('porta') ? 'porta' : (disponiveis[0] ?? 'porta'))
  }, [uhId, uhImages])

  // Crossfade elegante entre imagens — sem lib externa. A imagem anterior
  // fica por baixo (evita flash preto) enquanto a nova entra com fade + leve
  // zoom-out até o repouso.
  const [displaySrc, setDisplaySrc] = useState<string | null>(null)
  const [prevSrc, setPrevSrc] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(true)

  useEffect(() => {
    const url = imagemAtual?.imageUrl ?? null
    setPrevSrc((atual) => (url === displaySrc ? atual : displaySrc))
    if (url === displaySrc) return
    setDisplaySrc(url)
    setRevealed(false)
    const t = setTimeout(() => setRevealed(true), 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagemAtual?.imageUrl])

  function statusDoSpot(spot: UhSpot): StatusSpot {
    const it = statusPorItem.get(spot.checklistItemId)
    if (!it) return 'NAO_AVALIADO'
    return it.status
  }

  return (
    <div className="absolute inset-0 bg-black">
      {/* Camadas de imagem (crossfade) */}
      {prevSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={prevSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {displaySrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={displaySrc}
          src={displaySrc}
          alt={unidadeAtual ? `Unidade ${unidadeAtual.name} — ${ROOM_TYPE_LABELS[currentRoom]}` : ''}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1100ms] ease-out',
            revealed ? 'scale-100 opacity-100' : 'scale-[1.06] opacity-0',
          )}
        />
      )}

      {/* Estados vazios */}
      {!uhId && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="rounded-2xl bg-black/40 px-6 py-4 text-sm text-white/80 backdrop-blur-md">
            Nenhuma UH cadastrada.
          </p>
        </div>
      )}
      {uhId && imagensDaUh.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="max-w-sm rounded-2xl bg-black/40 px-6 py-4 text-center text-sm text-white/80 backdrop-blur-md">
            Esta UH ainda não tem fotos cadastradas. Configure em Configurações → UH 3D.
          </p>
        </div>
      )}

      {/* Seletor de UH — canto superior esquerdo */}
      <div className="absolute left-4 top-4 z-30 sm:left-6 sm:top-6">
        {uhDropdownOpen && (
          <div className="fixed inset-0 z-10" onClick={() => setUhDropdownOpen(false)} aria-hidden />
        )}
        <div className="relative z-20">
          <button
            onClick={() => setUhDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/55"
          >
            {unidadeAtual ? `Unidade ${unidadeAtual.name}` : 'Selecionar UH'}
            <ChevronDown className={cn('h-4 w-4 transition-transform', uhDropdownOpen && 'rotate-180')} />
          </button>
          {uhDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl bg-black/70 p-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur-xl">
              {unidades.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setUhId(u.id)
                    setUhDropdownOpen(false)
                  }}
                  className={cn(
                    'block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    u.id === uhId ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
                  )}
                >
                  Unidade {u.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card de conformidade — canto superior direito */}
      {uhId && (
        <div className="absolute right-4 top-4 z-20 rounded-2xl bg-black/40 px-4 py-3 text-right text-white shadow-lg backdrop-blur-md sm:right-6 sm:top-6">
          {percentual !== null ? (
            <>
              <p className="text-2xl font-semibold leading-none tabular-nums">{percentual}%</p>
              <p className="mt-1 text-[11px] text-white/70">
                {conformidade!.ok} de {conformidade!.total} itens conformes
              </p>
            </>
          ) : (
            <p className="text-xs text-white/70">Sem inspeção registrada</p>
          )}
        </div>
      )}

      {/* Spots de verificação */}
      {spotsDaImagem.map((spot) => {
        const status = statusDoSpot(spot)
        const item = itemPorId.get(spot.checklistItemId)
        return (
          <button
            key={spot.id}
            onClick={() => setDetailSpot(spot)}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            className={cn(
              'group absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-[opacity,transform] duration-700 ease-out',
              revealed ? 'scale-100 opacity-100 delay-300' : 'scale-75 opacity-0',
            )}
            title={item?.name ?? 'Item'}
          >
            {status === 'NAO_CONFORME' && (
              <span className="absolute inset-0 -m-1 animate-ping rounded-full bg-rose-500/40" />
            )}
            <span
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-lg ring-2 backdrop-blur-md transition-transform group-hover:scale-110',
                status === 'CONFORME' && 'ring-emerald-500',
                status === 'NAO_CONFORME' && 'ring-rose-500',
                status === 'NAO_AVALIADO' && 'ring-slate-300',
              )}
            >
              {status === 'CONFORME' && <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />}
              {status === 'NAO_CONFORME' && <X className="h-4 w-4 text-rose-600" strokeWidth={2.5} />}
              {status === 'NAO_AVALIADO' && <Minus className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.5} />}
            </span>
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 group-hover:block">
              {item?.name ?? 'Item removido do catálogo'}
            </span>
          </button>
        )
      })}

      {/* Balões de navegação entre cômodos — canto inferior direito */}
      {roomsDisponiveis.length > 1 && (
        <div className="absolute bottom-6 right-4 z-20 flex flex-col items-end gap-2 sm:right-6">
          {roomsDisponiveis
            .filter((r) => r !== currentRoom)
            .map((r) => {
              const Icon = ROOM_ICONS[r]
              return (
                <button
                  key={r}
                  onClick={() => setCurrentRoom(r)}
                  className="flex items-center gap-2 rounded-full bg-black/40 px-3.5 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/60"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {ROOM_TYPE_LABELS[r]}
                </button>
              )
            })}
        </div>
      )}

      {detailSpot && (
        <SpotDetailDialog
          podeOperar={podeOperar}
          spot={detailSpot}
          item={itemPorId.get(detailSpot.checklistItemId) ?? null}
          inspectionItem={statusPorItem.get(detailSpot.checklistItemId) ?? null}
          unidadeNome={unidadeAtual?.name ?? ''}
          onClose={() => setDetailSpot(null)}
        />
      )}
    </div>
  )
}

function SpotDetailDialog({
  podeOperar,
  spot,
  item,
  inspectionItem,
  unidadeNome,
  onClose,
}: {
  podeOperar: boolean
  spot: UhSpot
  item: ChecklistItem | null
  inspectionItem: InspectionItem | null
  unidadeNome: string
  onClose: () => void
}) {
  const [status, setStatus] = useState<'CONFORME' | 'NAO_CONFORME'>(inspectionItem?.status ?? 'CONFORME')
  const [comentario, setComentario] = useState(inspectionItem?.comment ?? '')
  const [fotos, setFotos] = useState<string[]>(inspectionItem?.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setStatus(inspectionItem?.status ?? 'CONFORME')
    setComentario(inspectionItem?.comment ?? '')
    setFotos(inspectionItem?.photos ?? [])
  }, [inspectionItem])

  async function adicionarFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    const restante = MAX_FOTOS_EDICAO - fotos.length
    if (restante <= 0) {
      toast.error(`Máximo de ${MAX_FOTOS_EDICAO} fotos.`)
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
        fd.append('pasta', `uh3d-edicoes/${unidadeNome}`)
        fd.append('tipo', 'inspecao')
        const res = await apiFetch('/api/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error('Falha no upload.')
        const data = await res.json()
        urls.push(data.url as string)
      }
      setFotos((f) => [...f, ...urls])
    } catch {
      toast.error('Não foi possível enviar a(s) foto(s).')
    } finally {
      setUploading(false)
    }
  }

  async function salvar() {
    if (!inspectionItem) return
    const comentarioLimpo = comentario.trim()
    if (status === 'NAO_CONFORME' && comentarioLimpo.length < 5) {
      toast.error('Descreva a não conformidade (mínimo 5 caracteres).')
      return
    }
    setSalvando(true)
    try {
      unwrapSafeAction(
        await editarSpotInspecaoAction({
          inspectionItemId: inspectionItem.id,
          status,
          comment: comentarioLimpo,
          photos: fotos,
        }),
      )
      toast.success('Item atualizado.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item?.name ?? 'Item removido do catálogo'}</DialogTitle>
          <DialogDescription>
            {item?.category ? `${item.category} — ` : ''}Unidade {unidadeNome}
          </DialogDescription>
        </DialogHeader>

        {!inspectionItem ? (
          <p className="text-sm text-muted-foreground">
            Este item ainda não foi avaliado nesta UH. Inicie uma inspeção completa na tela Inspeções para
            registrar o status.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={status === 'CONFORME' ? 'default' : 'outline'}
                disabled={!podeOperar}
                title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                className="flex-1 rounded-xl"
                onClick={() => setStatus('CONFORME')}
              >
                <Check className="h-4 w-4" />
                Conforme
              </Button>
              <Button
                type="button"
                variant={status === 'NAO_CONFORME' ? 'destructive' : 'outline'}
                disabled={!podeOperar}
                title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                className="flex-1 rounded-xl"
                onClick={() => setStatus('NAO_CONFORME')}
              >
                <X className="h-4 w-4" />
                Não conforme
              </Button>
            </div>

            {status === 'NAO_CONFORME' && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Descreva a falha *
                  </label>
                  <Textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="O que está não conforme?"
                    className="min-h-20 rounded-xl"
                    disabled={!podeOperar}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Fotos (opcional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {fotos.map((url) => (
                      <div key={url} className="group/foto relative h-16 w-16 overflow-hidden rounded-lg border border-border/70">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Evidência" className="h-full w-full object-cover" />
                        {podeOperar && (
                          <button
                            onClick={() => setFotos((f) => f.filter((p) => p !== url))}
                            className="absolute right-0.5 top-0.5 rounded-full bg-foreground/70 p-0.5 text-background opacity-0 transition-opacity group-hover/foto:opacity-100"
                            aria-label="Remover foto"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {podeOperar && fotos.length < MAX_FOTOS_EDICAO && (
                      <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-accent">
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Camera className="h-4 w-4" />
                            <span className="text-[10px]">Adicionar</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            adicionarFotos(e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {inspectionItem && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={salvando} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={
                !podeOperar ||
                salvando ||
                (status === 'NAO_CONFORME' && comentario.trim().length < 5)
              }
              className="rounded-xl"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
