'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Minus,
  Camera,
  Loader2,
  Menu,
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
// Server Action de edição do status do item (editarSpotInspecaoAction). Sem
// header/sidebar do dashboard aqui (ver dashboard.tsx) — o único jeito de
// sair no mobile é o botão de menu flutuante (onAbrirMenu).

const MAX_FOTOS_EDICAO = 4
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const DRAG_THRESHOLD_PX = 6

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
  onAbrirMenu,
}: {
  podeOperar: boolean
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  atribuicoes: AtribuicoesPorUnidade
  uhImages: UhImage[]
  uhSpots: UhSpot[]
  onAbrirMenu?: () => void
}) {
  const [uhId, setUhId] = useState<string>(unidades[0]?.id ?? '')
  const [uhDropdownOpen, setUhDropdownOpen] = useState(false)
  const [currentRoom, setCurrentRoom] = useState<RoomType>('porta')
  const [imageIndex, setImageIndex] = useState(0)
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
  // Um cômodo pode ter mais de uma foto — agrupadas por tipo, na ordem em
  // que foram cadastradas (uhImages já vem createdAt asc do page.tsx).
  const imagensPorTipo = useMemo(() => {
    const m = new Map<RoomType, UhImage[]>()
    for (const t of ROOM_TYPES) m.set(t, imagensDaUh.filter((i) => i.tipo === t))
    return m
  }, [imagensDaUh])
  const roomsDisponiveis = useMemo(
    () => ROOM_TYPES.filter((t) => (imagensPorTipo.get(t)?.length ?? 0) > 0),
    [imagensPorTipo],
  )
  const imagensDoRoom = imagensPorTipo.get(currentRoom) ?? []
  const imagemAtual = imagensDoRoom[imageIndex] ?? imagensDoRoom[0]

  // Itens ainda atribuídos a esta UH — um spot cujo item foi desatribuído
  // depois de criado (ver atribuicoes) some da tela, mesmo que o registro
  // continue no cadastro (Configurações → UH 3D é quem cuida de removê-lo).
  const idsAplicaveis = useMemo(() => {
    const ids = uhId ? itensParaUnidade(uhId, itens, atribuicoes) : []
    return new Set(ids.map((it) => it.id))
  }, [uhId, itens, atribuicoes])

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

  // Trocou de UH ou de cômodo — sempre começa pela primeira foto da lista.
  useEffect(() => {
    setImageIndex(0)
  }, [uhId, currentRoom])

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

  // Zoom/pan manuais (sem lib) — scroll/pinch pra ampliar, arrastar pra
  // rolar quando ampliado. Reseta sempre que a foto exibida muda.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const draggedRef = useRef(false)
  const pressedSpotIdRef = useRef<string | null>(null)

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [imagemAtual?.id])

  function clampPan(z: number, p: { x: number; y: number }) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return p
    const maxX = Math.max(0, (rect.width * (z - 1)) / 2)
    const maxY = Math.max(0, (rect.height * (z - 1)) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const delta = -e.deltaY * 0.0018
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta * z))
      setPan((p) => clampPan(next, p))
      return next
    })
  }

  function onStagePointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    draggedRef.current = false
    // setPointerCapture redireciona o clique nativo pro palco (perde o
    // target original) — por isso guardamos aqui, no pointerdown, qual spot
    // (se algum) recebeu o toque, pra decidir manualmente no pointerup.
    const spotEl = (e.target as HTMLElement).closest?.('[data-spot-id]') as HTMLElement | null
    pressedSpotIdRef.current = spotEl?.dataset.spotId ?? null
    if (pointersRef.current.size === 1 && zoom > 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values())
      pinchStartRef.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom }
      panStartRef.current = null
    }
  }

  function onStagePointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, pinchStartRef.current.zoom * (dist / pinchStartRef.current.dist)),
      )
      draggedRef.current = true
      setZoom(nextZoom)
      setPan((p) => clampPan(nextZoom, p))
    } else if (pointersRef.current.size === 1 && panStartRef.current && zoom > 1) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) draggedRef.current = true
      setPan(clampPan(zoom, { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy }))
    }
  }

  function onStagePointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchStartRef.current = null
    if (pointersRef.current.size === 0) {
      panStartRef.current = null
      // Abre o spot aqui (em vez de um onClick nele) porque o clique nativo
      // não chega mais até o botão depois do setPointerCapture acima.
      if (!draggedRef.current && pressedSpotIdRef.current) {
        const spot = spotsDaImagem.find((s) => s.id === pressedSpotIdRef.current)
        if (spot) setDetailSpot(spot)
      }
      pressedSpotIdRef.current = null
    }
  }

  function onStageDoubleClick() {
    if (zoom > 1) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } else {
      setZoom(2.2)
    }
  }

  function statusDoSpot(spot: UhSpot): StatusSpot {
    const it = statusPorItem.get(spot.checklistItemId)
    if (!it) return 'NAO_AVALIADO'
    return it.status
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* Palco com zoom/pan — imagem + spots viajam juntos. */}
      <div
        ref={stageRef}
        onWheel={onWheel}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
        onDoubleClick={onStageDoubleClick}
        className={cn('absolute inset-0 touch-none select-none', zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
      >
        <div
          style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
          className="absolute inset-0 transition-transform duration-150 ease-out"
        >
          <div style={{ transform: `scale(${zoom})` }} className="absolute inset-0 transition-transform duration-150 ease-out">
            {prevSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prevSrc} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            )}
            {displaySrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={displaySrc}
                src={displaySrc}
                alt={unidadeAtual ? `Unidade ${unidadeAtual.name} — ${ROOM_TYPE_LABELS[currentRoom]}` : ''}
                draggable={false}
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1100ms] ease-out',
                  revealed ? 'scale-100 opacity-100' : 'scale-[1.06] opacity-0',
                )}
              />
            )}

            {/* Spots de verificação */}
            {spotsDaImagem.map((spot) => {
              const status = statusDoSpot(spot)
              const item = itemPorId.get(spot.checklistItemId)
              return (
                <button
                  key={spot.id}
                  type="button"
                  data-spot-id={spot.id}
                  onKeyDown={(e) => {
                    // Clique de mouse/toque é tratado no pointerup do palco
                    // (ver onStagePointerUp) — aqui só cobre ativação por
                    // teclado, que não passa pelo pointer capture.
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setDetailSpot(spot)
                    }
                  }}
                  style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                  className={cn(
                    'group absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-[opacity,transform] duration-700 ease-out',
                    revealed ? 'scale-100 opacity-100 delay-300' : 'scale-75 opacity-0',
                  )}
                  title={item?.name ?? 'Item'}
                >
                  {status === 'NAO_CONFORME' && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/30" />
                  )}
                  <span
                    className={cn(
                      'relative flex h-6 w-6 items-center justify-center rounded-full shadow-sm ring-1 backdrop-blur-[2px] transition-transform group-hover:scale-125',
                      status === 'CONFORME' && 'bg-emerald-500/25 ring-emerald-300/80',
                      status === 'NAO_CONFORME' && 'bg-rose-500/30 ring-rose-300/85',
                      status === 'NAO_AVALIADO' && 'bg-white/10 ring-white/45',
                    )}
                  >
                    {status === 'CONFORME' && <Check className="h-3 w-3 text-emerald-200" strokeWidth={2.75} />}
                    {status === 'NAO_CONFORME' && <X className="h-3 w-3 text-rose-200" strokeWidth={2.75} />}
                    {status === 'NAO_AVALIADO' && <Minus className="h-2.5 w-2.5 text-white/80" strokeWidth={2.75} />}
                  </span>
                  <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 group-hover:block">
                    {item?.name ?? 'Item removido do catálogo'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Estados vazios */}
      {!uhId && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-2xl bg-black/40 px-6 py-4 text-sm text-white/80 backdrop-blur-md">
            Nenhuma UH cadastrada.
          </p>
        </div>
      )}
      {uhId && imagensDaUh.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <p className="max-w-sm rounded-2xl bg-black/40 px-6 py-4 text-center text-sm text-white/80 backdrop-blur-md">
            Esta UH ainda não tem fotos cadastradas. Configure em Configurações → UH 3D.
          </p>
        </div>
      )}

      {/* Botão de menu — só mobile, já que a barra de topo some nesta tela */}
      {onAbrirMenu && (
        <button
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          className="absolute bottom-6 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/55 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
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
        <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-2xl bg-black/40 px-4 py-3 text-right text-white shadow-lg backdrop-blur-md sm:right-6 sm:top-6">
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

      {/* Navegação entre fotos do mesmo cômodo — setas laterais + pontos */}
      {imagensDoRoom.length > 1 && (
        <>
          <button
            onClick={() => setImageIndex((i) => (i - 1 + imagensDoRoom.length) % imagensDoRoom.length)}
            aria-label="Foto anterior"
            className="absolute left-4 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55 sm:left-6"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setImageIndex((i) => (i + 1) % imagensDoRoom.length)}
            aria-label="Próxima foto"
            className="absolute right-4 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55 sm:right-6"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 backdrop-blur-md">
            {imagensDoRoom.map((img, i) => (
              <button
                key={img.id}
                onClick={() => setImageIndex(i)}
                aria-label={`Foto ${i + 1}`}
                className={cn('h-1.5 rounded-full transition-all', i === imageIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60')}
              />
            ))}
          </div>
        </>
      )}

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
      setFotos((f) => [...f, ...urls])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a(s) foto(s).')
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
