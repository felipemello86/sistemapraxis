'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  MapPin,
  Clock,
  Check,
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Panel, StatCard } from '@/components/ui-kit'
import { toast } from 'sonner'
import {
  corCategoria,
  diasDesde,
  formatarData,
  itensParaUnidade,
  ultimaInspecaoPorUnidade,
} from '@/lib/domain'
import { createInspecaoAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  InspecaoComUnidade,
  UnitOption,
} from '@/lib/types'

// Reconstrução do fluxo real da "Rota de Manutenção" recuperado do
// protótipo standalone "Bnb Manutenção" (PageManutencao no
// sistema-manutencao.html) — inspeção gamificada item a item, com foto na
// não conformidade. A versão anterior desta tela (mesma rota/nome) era só
// compartilhamento de lista via WhatsApp; foi substituída por completo —
// WhatsApp não entra na v2 (visão de comunicação futura é push
// notification).

const MAX_FOTOS_POR_ITEM = 4

type Resposta = {
  status: 'CONFORME' | 'NAO_CONFORME'
  comment: string
  photos: string[]
}

export function RotaManutencao({
  unidades,
  itens,
  inspecoes,
  atribuicoes,
  maxDias,
}: {
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  atribuicoes: AtribuicoesPorUnidade
  maxDias: number
}) {
  const [pending, startTransition] = useTransition()
  const [etapa, setEtapa] = useState<'lista' | 'execucao' | 'resumo'>('lista')
  const [unidadeAtual, setUnidadeAtual] = useState<UnitOption | null>(null)
  const [indice, setIndice] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)

  const ultimaMap = useMemo(() => ultimaInspecaoPorUnidade(inspecoes), [inspecoes])

  const rota = useMemo(() => {
    return unidades
      .map((u) => {
        const ult = ultimaMap.get(u.id)
        const dias = ult ? diasDesde(ult.date) : null
        const prioridade = dias === null ? 999999 : dias
        return { unidade: u, ultima: ult, dias, prioridade }
      })
      .sort((a, b) => b.prioridade - a.prioridade)
  }, [unidades, ultimaMap])

  const pendentes = rota.filter((r) => r.dias === null || r.dias >= maxDias)

  const itensDaUnidade = useMemo(
    () => (unidadeAtual ? itensParaUnidade(unidadeAtual.id, itens, atribuicoes) : []),
    [unidadeAtual, itens, atribuicoes],
  )

  function iniciarInspecao(unidade: UnitOption) {
    const itensFiltrados = itensParaUnidade(unidade.id, itens, atribuicoes)
    if (itensFiltrados.length === 0) {
      toast.error('Essa unidade não tem itens de checklist atribuídos.')
      return
    }
    setUnidadeAtual(unidade)
    setRespostas(
      Object.fromEntries(
        itensFiltrados.map((it) => [it.id, { status: 'CONFORME', comment: '', photos: [] }]),
      ),
    )
    setIndice(0)
    setEtapa('execucao')
  }

  function cancelarInspecao() {
    setUnidadeAtual(null)
    setRespostas({})
    setIndice(0)
    setEtapa('lista')
  }

  function marcar(itemId: string, status: 'CONFORME' | 'NAO_CONFORME') {
    setRespostas((r) => ({ ...r, [itemId]: { ...r[itemId], status } }))
  }

  function setComentario(itemId: string, comment: string) {
    setRespostas((r) => ({ ...r, [itemId]: { ...r[itemId], comment } }))
  }

  async function adicionarFotos(itemId: string, files: FileList | null) {
    if (!files || files.length === 0 || !unidadeAtual) return
    const atual = respostas[itemId]?.photos ?? []
    const restante = MAX_FOTOS_POR_ITEM - atual.length
    if (restante <= 0) {
      toast.error(`Máximo de ${MAX_FOTOS_POR_ITEM} fotos por item.`)
      return
    }
    const arquivos = Array.from(files).slice(0, restante)
    setUploadingItemId(itemId)
    try {
      const urls: string[] = []
      for (const file of arquivos) {
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`"${file.name}" é maior que 8MB — pulado.`)
          continue
        }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('pasta', `inspecoes/${unidadeAtual.name}`)
        fd.append('tipo', 'item')
        const res = await apiFetch('/api/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error('Falha no upload.')
        const data = await res.json()
        urls.push(data.url as string)
      }
      setRespostas((r) => ({
        ...r,
        [itemId]: { ...r[itemId], photos: [...(r[itemId]?.photos ?? []), ...urls] },
      }))
    } catch {
      toast.error('Não foi possível enviar a(s) foto(s).')
    } finally {
      setUploadingItemId(null)
    }
  }

  function removerFoto(itemId: string, url: string) {
    setRespostas((r) => ({
      ...r,
      [itemId]: { ...r[itemId], photos: (r[itemId]?.photos ?? []).filter((p) => p !== url) },
    }))
  }

  function irPara(novoIndice: number) {
    if (novoIndice < 0) return
    if (novoIndice >= itensDaUnidade.length) {
      setEtapa('resumo')
      return
    }
    setIndice(novoIndice)
  }

  function salvarInspecao() {
    if (!unidadeAtual) return
    const itensPayload = itensDaUnidade.map((it) => {
      const resp = respostas[it.id]
      return {
        checklistItemId: it.id,
        status: resp?.status ?? 'CONFORME',
        comment: resp?.status === 'NAO_CONFORME' ? resp.comment || undefined : undefined,
        photos: resp?.status === 'NAO_CONFORME' ? resp.photos : [],
      }
    })

    startTransition(async () => {
      try {
        unwrapSafeAction(
          await createInspecaoAction({ uhId: unidadeAtual.id, itens: itensPayload }),
        )
        toast.success('Inspeção registrada com sucesso.')
        cancelarInspecao()
      } catch {
        toast.error('Não foi possível salvar a inspeção.')
      }
    })
  }

  // ── Etapa: lista de unidades ────────────────────────────────────────────
  if (etapa === 'lista') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Pendentes"
            value={pendentes.length}
            hint={`+ de ${maxDias} dias sem inspeção`}
            tone="warning"
            icon={<MapPin className="h-[18px] w-[18px]" />}
          />
          <StatCard
            label="Nunca inspecionadas"
            value={rota.filter((r) => r.dias === null).length}
            hint="prioridade máxima"
            tone="danger"
            icon={<Clock className="h-[18px] w-[18px]" />}
          />
          <StatCard
            label="Unidades em dia"
            value={unidades.length - pendentes.length}
            hint="dentro do prazo"
            tone="success"
          />
        </div>

        <Panel
          title="Selecionar unidade"
          description="Toque numa unidade para iniciar a inspeção item a item"
        >
          {rota.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma unidade cadastrada.
            </p>
          ) : (
            <ol className="space-y-2">
              {rota.map((r) => (
                <li key={r.unidade.id}>
                  <button
                    onClick={() => iniciarInspecao(r.unidade)}
                    className="flex w-full items-center gap-4 rounded-xl border border-border/70 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        Unidade {r.unidade.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.ultima ? `Última: ${formatarData(r.ultima.date)}` : 'Nunca inspecionada'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        r.dias === null
                          ? 'border-destructive/30 bg-destructive/12 text-destructive'
                          : r.dias >= maxDias
                            ? 'border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]'
                            : 'border-[var(--success)]/30 bg-[var(--success)]/12 text-[var(--success)]'
                      }
                    >
                      {r.dias === null ? 'Urgente' : r.dias >= maxDias ? `${r.dias} dias` : 'Em dia'}
                    </Badge>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    )
  }

  // ── Etapa: execução item a item ─────────────────────────────────────────
  if (etapa === 'execucao' && unidadeAtual) {
    const item = itensDaUnidade[indice]
    const resp = respostas[item.id]
    const progresso = ((indice + 1) / itensDaUnidade.length) * 100
    const naoConforme = resp?.status === 'NAO_CONFORME'

    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Unidade {unidadeAtual.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Item {indice + 1} de {itensDaUnidade.length}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={cancelarInspecao} className="rounded-xl">
            Cancelar
          </Button>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progresso}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {itensDaUnidade.map((it, i) => {
            const r = respostas[it.id]
            const respondido = i < indice || (i === indice && r)
            return (
              <span
                key={it.id}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    respondido && r?.status === 'NAO_CONFORME'
                      ? 'var(--warning)'
                      : respondido
                        ? corCategoria(it.category)
                        : 'var(--border)',
                  opacity: i === indice ? 1 : 0.6,
                }}
              />
            )
          })}
        </div>

        <Panel className="space-y-5">
          <div>
            <Badge
              variant="outline"
              style={{ borderColor: corCategoria(item.category), color: corCategoria(item.category) }}
            >
              {item.category}
            </Badge>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">{item.name}</h3>
            {item.subDescription && (
              <p className="mt-1 text-sm text-muted-foreground">{item.subDescription}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => marcar(item.id, 'CONFORME')}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-6 transition-colors ${
                resp?.status === 'CONFORME'
                  ? 'border-[var(--success)] bg-[var(--success)]/12 text-[var(--success)]'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <Check className="h-7 w-7" />
              <span className="text-sm font-medium">Conforme</span>
            </button>
            <button
              onClick={() => marcar(item.id, 'NAO_CONFORME')}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-6 transition-colors ${
                naoConforme
                  ? 'border-[var(--warning)] bg-[var(--warning)]/12 text-[var(--warning)]'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <AlertTriangle className="h-7 w-7" />
              <span className="text-sm font-medium">Não Conforme</span>
            </button>
          </div>

          {naoConforme && (
            <div className="space-y-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/8 p-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Descreva o problema *
                </label>
                <Textarea
                  value={resp?.comment ?? ''}
                  onChange={(e) => setComentario(item.id, e.target.value)}
                  placeholder="O que foi encontrado?"
                  className="min-h-20 rounded-xl bg-background"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Fotos (opcional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {(resp?.photos ?? []).map((url) => (
                    <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border/70">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Evidência" className="h-full w-full object-cover" />
                      <button
                        onClick={() => removerFoto(item.id, url)}
                        className="absolute right-0.5 top-0.5 rounded-full bg-foreground/70 p-0.5 text-background opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remover foto"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {(resp?.photos ?? []).length < MAX_FOTOS_POR_ITEM && (
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-accent">
                      {uploadingItemId === item.id ? (
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
                        disabled={uploadingItemId === item.id}
                        onChange={(e) => {
                          adicionarFotos(item.id, e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </Panel>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => irPara(indice - 1)}
            disabled={indice === 0}
            className="h-11 flex-1 rounded-xl"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button
            onClick={() => irPara(indice + 1)}
            disabled={naoConforme && !resp?.comment?.trim()}
            className="h-11 flex-1 rounded-xl"
          >
            {indice === itensDaUnidade.length - 1 ? 'Ver resumo' : 'Próximo'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Etapa: resumo final ─────────────────────────────────────────────────
  if (etapa === 'resumo' && unidadeAtual) {
    const naoConformes = itensDaUnidade.filter((it) => respostas[it.id]?.status === 'NAO_CONFORME')
    const conformes = itensDaUnidade.length - naoConformes.length
    const pct = Math.round((conformes / itensDaUnidade.length) * 100)

    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Resumo — Unidade {unidadeAtual.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Confira antes de salvar a inspeção.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Conformes" value={conformes} tone="success" />
          <StatCard label="Não conformes" value={naoConformes.length} tone="warning" />
          <StatCard label="Conformidade" value={`${pct}%`} tone="primary" />
        </div>

        {naoConformes.length > 0 && (
          <Panel title="Itens não conformes">
            <div className="space-y-3">
              {naoConformes.map((it) => {
                const r = respostas[it.id]
                return (
                  <div key={it.id} className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        style={{ borderColor: corCategoria(it.category), color: corCategoria(it.category) }}
                      >
                        {it.category}
                      </Badge>
                      <p className="text-sm font-medium">{it.name}</p>
                    </div>
                    {r?.comment && (
                      <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>
                    )}
                    {r?.photos && r.photos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.photos.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={url}
                            src={url}
                            alt="Evidência"
                            className="h-14 w-14 rounded-lg border border-border/70 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        )}

        {naoConformes.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card py-10 text-center">
            <ClipboardList className="h-8 w-8 text-[var(--success)]" />
            <p className="text-sm text-muted-foreground">
              Tudo conforme. Nenhuma pendência encontrada.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={cancelarInspecao}
            disabled={pending}
            className="h-11 flex-1 rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            onClick={salvarInspecao}
            disabled={pending}
            className="h-11 flex-1 rounded-xl"
          >
            {pending ? 'Salvando...' : 'Salvar inspeção'}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
