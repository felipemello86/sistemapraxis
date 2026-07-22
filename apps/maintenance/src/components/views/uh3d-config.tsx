'use client'

import { useMemo, useState, useTransition } from 'react'
import { Upload, Trash2, X, MapPin, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Panel } from '@/components/ui-kit'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { itensParaUnidade } from '@/lib/domain'
import {
  salvarUhImagemAction,
  deleteUhImagemAction,
  createUhSpotAction,
  updateUhSpotAction,
  deleteUhSpotAction,
} from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import { ROOM_TYPES, ROOM_TYPE_LABELS } from '@/lib/types'
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  RoomType,
  UhImage,
  UhSpot,
  UnitOption,
} from '@/lib/types'

// Cadastro da tela imersiva "UH 3D" (ver components/views/uh-3d.tsx pro
// resultado final). Fotos e spots são por UH individual — decisão explícita
// do Felipe, mesmo que o layout se repita entre unidades (ver comentário no
// schema Prisma, model MaintenanceUhImage).
export function Uh3dConfigTab({
  podeOperar,
  unidades,
  itens,
  atribuicoes,
  uhImages,
  uhSpots,
}: {
  podeOperar: boolean
  unidades: UnitOption[]
  itens: ChecklistItem[]
  atribuicoes: AtribuicoesPorUnidade
  uhImages: UhImage[]
  uhSpots: UhSpot[]
}) {
  const [, startTransition] = useTransition()
  const [uhId, setUhId] = useState<string>('')
  const [editorTipo, setEditorTipo] = useState<RoomType | null>(null)
  const [editorImageId, setEditorImageId] = useState<string | null>(null)
  const [uploadingTipo, setUploadingTipo] = useState<RoomType | null>(null)
  const [placingAt, setPlacingAt] = useState<{ x: number; y: number } | null>(null)
  const [draggingSpotId, setDraggingSpotId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  const itemPorId = useMemo(() => new Map(itens.map((it) => [it.id, it])), [itens])

  // Um cômodo pode ter mais de uma foto — agrupadas por tipo, na ordem em
  // que foram cadastradas (uhImages já vem createdAt asc do page.tsx).
  const imagensDaUh = useMemo(() => uhImages.filter((i) => i.uhId === uhId), [uhImages, uhId])
  const imagensPorTipo = useMemo(() => {
    const m = new Map<RoomType, UhImage[]>()
    for (const t of ROOM_TYPES) m.set(t, imagensDaUh.filter((i) => i.tipo === t))
    return m
  }, [imagensDaUh])

  const itensDaUh = useMemo(
    () => (uhId ? itensParaUnidade(uhId, itens, atribuicoes) : []),
    [uhId, itens, atribuicoes],
  )

  const imagemAtual = editorImageId ? imagensDaUh.find((i) => i.id === editorImageId) : undefined
  const spotsDaImagem = useMemo(
    () => (imagemAtual ? uhSpots.filter((s) => s.imageId === imagemAtual.id) : []),
    [uhSpots, imagemAtual],
  )
  const idsComSpotNaImagem = useMemo(
    () => new Set(spotsDaImagem.map((s) => s.checklistItemId)),
    [spotsDaImagem],
  )

  // Pendências: itens aplicáveis a esta UH sem spot em NENHUMA das imagens dela.
  const itensSemSpot = useMemo(() => {
    const idsImagens = new Set(imagensDaUh.map((i) => i.id))
    const idsComSpot = new Set(uhSpots.filter((s) => idsImagens.has(s.imageId)).map((s) => s.checklistItemId))
    return itensDaUh.filter((it) => !idsComSpot.has(it.id))
  }, [uhSpots, imagensDaUh, itensDaUh])

  async function handleUpload(tipo: RoomType, file: File) {
    if (!podeOperar || !uhId) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Imagem maior que 8MB.')
      return
    }
    setUploadingTipo(tipo)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pasta', `uh3d/${uhId}`)
      fd.append('tipo', tipo)
      const res = await apiFetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        // Tenta extrair a mensagem real do erro (nossa rota devolve JSON com
        // `error`; uma falha de plataforma — ex.: limite de tamanho do corpo
        // da requisição no Vercel — pode devolver texto puro em vez de JSON).
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
      const novoId = unwrapSafeAction(await salvarUhImagemAction({ uhId, tipo, imageUrl: data.url }))
      // Já abre o editor de spots na foto recém-enviada — próximo passo
      // natural depois de subir uma imagem.
      setEditorTipo(tipo)
      setEditorImageId(novoId)
      toast.success('Foto salva.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar a foto.')
    } finally {
      setUploadingTipo(null)
    }
  }

  function removerImagem(img: UhImage) {
    if (!podeOperar) return
    if (
      !confirm(
        `Remover esta foto de ${ROOM_TYPE_LABELS[img.tipo as RoomType] ?? img.tipo}? Os spots dela também serão removidos.`,
      )
    )
      return
    startTransition(async () => {
      try {
        unwrapSafeAction(await deleteUhImagemAction(img.id))
        toast.success('Foto removida.')
        if (editorImageId === img.id) {
          setEditorImageId(null)
          setEditorTipo(null)
        }
      } catch {
        toast.error('Erro ao remover foto.')
      }
    })
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!podeOperar || draggingSpotId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPlacingAt({ x, y })
  }

  function escolherItemParaSpot(checklistItemId: string) {
    if (!placingAt || !imagemAtual) return
    const { x, y } = placingAt
    setPlacingAt(null)
    startTransition(async () => {
      try {
        unwrapSafeAction(await createUhSpotAction({ imageId: imagemAtual.id, checklistItemId, x, y }))
      } catch {
        toast.error('Erro ao adicionar spot.')
      }
    })
  }

  function removerSpot(spotId: string) {
    if (!podeOperar) return
    startTransition(async () => {
      try {
        unwrapSafeAction(await deleteUhSpotAction(spotId))
      } catch {
        toast.error('Erro ao remover spot.')
      }
    })
  }

  function onSpotPointerDown(e: React.PointerEvent, spotId: string) {
    if (!podeOperar) return
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDraggingSpotId(spotId)
  }
  function onWrapPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingSpotId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    setDragPos({ x, y })
  }
  function onWrapPointerUp() {
    if (draggingSpotId && dragPos) {
      const id = draggingSpotId
      const pos = dragPos
      startTransition(async () => {
        try {
          unwrapSafeAction(await updateUhSpotAction(id, pos))
        } catch {
          toast.error('Erro ao mover spot.')
        }
      })
    }
    setDraggingSpotId(null)
    setDragPos(null)
  }

  return (
    <div className="space-y-6">
      <Panel
        title="UH 3D — fotos e spots de verificação"
        description="Fotos por UH individual. Todo item de verificação precisa de um spot em pelo menos uma imagem."
      >
        <div className="max-w-sm">
          <Select
            value={uhId}
            onValueChange={(v) => {
              setUhId(v ?? '')
              setEditorTipo(null)
              setEditorImageId(null)
              setPlacingAt(null)
            }}
          >
            <SelectTrigger className="h-10 rounded-xl">
              {/* Select do Base UI não resolve o texto do item sozinho — sem
                  essa função, ele cai pro value cru (o id). Mesmo padrão de
                  informacoes.tsx. */}
              <SelectValue placeholder="Selecione a UH">
                {(value: string | null) => {
                  const u = unidades.find((x) => x.id === value)
                  return u ? `Unidade ${u.name}` : 'Selecione a UH'
                }}
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
      </Panel>

      {uhId && (
        <>
          <Panel title="Fotos por cômodo" description="Cada cômodo pode ter mais de uma foto.">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {ROOM_TYPES.map((tipo) => {
                const imagens = imagensPorTipo.get(tipo) ?? []
                const isUploading = uploadingTipo === tipo
                return (
                  <div key={tipo} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{ROOM_TYPE_LABELS[tipo]}</p>
                      {tipo === 'porta' && (
                        <Badge variant="outline" className="text-[10px]">
                          Entrada
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {imagens.map((img) => {
                        const totalSpots = uhSpots.filter((s) => s.imageId === img.id).length
                        const emEdicao = editorImageId === img.id
                        return (
                          <div
                            key={img.id}
                            className={cn(
                              'group relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-xl border bg-muted',
                              emEdicao ? 'border-primary ring-2 ring-primary/40' : 'border-border/70',
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.imageUrl} alt={ROOM_TYPE_LABELS[tipo]} className="h-full w-full object-cover" />
                            <div className="absolute inset-0 flex items-end justify-between gap-1.5 bg-gradient-to-t from-black/65 via-transparent to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => {
                                  setEditorTipo(tipo)
                                  setEditorImageId(img.id)
                                }}
                                className="flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-white"
                              >
                                <MapPin className="h-3 w-3" />
                                {totalSpots}
                              </button>
                              <button
                                onClick={() => removerImagem(img)}
                                disabled={!podeOperar}
                                className="rounded-lg bg-black/40 p-1 text-white transition-colors hover:bg-destructive disabled:opacity-40"
                                aria-label="Remover foto"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            {emEdicao && (
                              <div className="absolute inset-x-0 top-0 bg-primary/90 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
                                Editando
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <label
                        className={cn(
                          'flex aspect-[4/3] w-32 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-muted-foreground',
                          podeOperar ? 'cursor-pointer hover:border-foreground/40 hover:text-foreground' : 'cursor-not-allowed opacity-50',
                        )}
                        title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            <span className="text-[10px]">{imagens.length === 0 ? 'Enviar foto' : 'Adicionar'}</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={!podeOperar || isUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            e.target.value = ''
                            if (f) handleUpload(tipo, f)
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {imagemAtual && editorTipo && (
            <Panel
              title={`Spots — ${ROOM_TYPE_LABELS[editorTipo]}`}
              description="Clique na imagem para adicionar um spot. Arraste um spot existente para reposicionar."
            >
              <div
                className="relative mx-auto aspect-video w-full max-w-3xl touch-none select-none overflow-hidden rounded-2xl border border-border/70 bg-black"
                onClick={handleImageClick}
                onPointerMove={onWrapPointerMove}
                onPointerUp={onWrapPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagemAtual.imageUrl}
                  alt=""
                  className="pointer-events-none h-full w-full object-cover"
                  draggable={false}
                />
                {spotsDaImagem.map((spot) => {
                  const pos = draggingSpotId === spot.id && dragPos ? dragPos : spot
                  const item = itemPorId.get(spot.checklistItemId)
                  return (
                    <div
                      key={spot.id}
                      onPointerDown={(e) => onSpotPointerDown(e, spot.id)}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      className={cn(
                        'group/spot absolute -translate-x-1/2 -translate-y-1/2',
                        podeOperar ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                      )}
                    >
                      <div className="h-5 w-5 rounded-full border-2 border-white bg-primary shadow-lg ring-2 ring-black/20" />
                      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 group-hover/spot:block">
                        {item?.name ?? 'Item removido'}
                      </div>
                      {podeOperar && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removerSpot(spot.id)
                          }}
                          className="pointer-events-auto absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-white group-hover/spot:flex"
                          aria-label="Remover spot"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {placingAt && (
                <div className="mt-3 rounded-xl border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Qual item fica neste ponto?</p>
                    <button
                      onClick={() => setPlacingAt(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {itensDaUh.map((it) => {
                      const jaTemNestaImagem = idsComSpotNaImagem.has(it.id)
                      return (
                        <button
                          key={it.id}
                          disabled={jaTemNestaImagem}
                          onClick={() => escolherItemParaSpot(it.id)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                            jaTemNestaImagem
                              ? 'cursor-not-allowed border-border bg-muted text-muted-foreground/50'
                              : 'border-border hover:border-primary hover:bg-primary/10 hover:text-primary',
                          )}
                        >
                          {it.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </Panel>
          )}

          <Panel
            title="Pendências"
            description={
              itensDaUh.length === 0
                ? 'Nenhum item de checklist se aplica a esta UH.'
                : itensSemSpot.length === 0
                  ? 'Todos os itens desta UH já têm spot cadastrado.'
                  : `${itensSemSpot.length} de ${itensDaUh.length} itens ainda sem spot em nenhuma imagem.`
            }
          >
            {itensDaUh.length > 0 && itensSemSpot.length === 0 ? (
              <div className="flex items-center gap-2 py-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Tudo certo por aqui.
              </div>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {itensSemSpot.map((it) => (
                  <li key={it.id}>
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                      {it.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
