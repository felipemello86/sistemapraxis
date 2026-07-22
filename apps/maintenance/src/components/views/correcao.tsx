'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Wrench,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Camera,
  Loader2,
  X,
  CheckCircle2,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/ui-kit'
import { toast } from 'sonner'
import { corCategoria, formatarData, ultimaInspecaoPorUnidade } from '@/lib/domain'
import { createCorrecaoAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import { ItemInfoField } from '@/components/item-info-field'
import type {
  ChecklistItem,
  CorrectionSummary,
  InspecaoComUnidade,
  InspectionItem,
  ItemInfo,
  ItemInfoLogEntry,
  UnitOption,
} from '@/lib/types'

// Rota de Correção — recuperada do protótipo standalone "Bnb Manutenção"
// (PageCorrecao / REGISTER_CORRECAO no sistema-manutencao.html). Não existia
// nenhuma versão anterior desta tela na v2. Fluxo de 3 passos: escolher a UH
// com pendência → escolher o item não conforme → descrever o reparo (+ foto
// opcional). Ao salvar, o item volta pra CONFORME e fica um histórico
// permanente (MaintenanceCorrection).

const MAX_FOTOS = 4

export function RotaCorrecao({
  podeOperar,
  unidades,
  itens,
  inspecoes,
  correcoesRecentes,
  itemInfos,
  itemInfoLogs,
}: {
  podeOperar: boolean
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  correcoesRecentes: CorrectionSummary[]
  itemInfos: ItemInfo[]
  itemInfoLogs: ItemInfoLogEntry[]
}) {
  const [pending, startTransition] = useTransition()
  const [etapa, setEtapa] = useState<'unidade' | 'item' | 'descricao'>('unidade')
  const [unidadeAtual, setUnidadeAtual] = useState<UnitOption | null>(null)
  const [itemAtual, setItemAtual] = useState<InspectionItem | null>(null)
  const [descricao, setDescricao] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const ultimaMap = useMemo(() => ultimaInspecaoPorUnidade(inspecoes), [inspecoes])

  const itensPorId = useMemo(() => {
    const m = new Map<string, ChecklistItem>()
    for (const it of itens) m.set(it.id, it)
    return m
  }, [itens])

  // Unidades cuja última inspeção tem ao menos um item não conforme ainda
  // não corrigido — mesmo critério do "unitsWithNC" do protótipo original.
  const unidadesComPendencia = useMemo(() => {
    return unidades
      .map((u) => {
        const ult = ultimaMap.get(u.id)
        const pendentes = ult ? ult.items.filter((it) => it.status === 'NAO_CONFORME') : []
        return { unidade: u, ultima: ult, pendentes }
      })
      .filter((r) => r.pendentes.length > 0)
  }, [unidades, ultimaMap])

  const itensPendentesDaUnidade = useMemo(() => {
    if (!unidadeAtual) return []
    const ult = ultimaMap.get(unidadeAtual.id)
    if (!ult) return []
    return ult.items.filter((it) => it.status === 'NAO_CONFORME')
  }, [unidadeAtual, ultimaMap])

  function escolherUnidade(u: UnitOption) {
    if (!podeOperar) return
    setUnidadeAtual(u)
    setEtapa('item')
  }

  function escolherItem(item: InspectionItem) {
    setItemAtual(item)
    setDescricao('')
    setFotos([])
    setEtapa('descricao')
  }

  function reiniciar() {
    setUnidadeAtual(null)
    setItemAtual(null)
    setDescricao('')
    setFotos([])
    setEtapa('unidade')
  }

  async function adicionarFotos(files: FileList | null) {
    if (!files || files.length === 0 || !unidadeAtual) return
    const restante = MAX_FOTOS - fotos.length
    if (restante <= 0) {
      toast.error(`Máximo de ${MAX_FOTOS} fotos.`)
      return
    }
    const arquivos = Array.from(files).slice(0, restante)
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of arquivos) {
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`"${file.name}" é maior que 8MB — pulado.`)
          continue
        }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('pasta', `correcoes/${unidadeAtual.name}`)
        fd.append('tipo', 'correcao')
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

  function salvar() {
    if (!itemAtual) return
    if (descricao.trim().length < 5) {
      toast.error('Descreva o que foi corrigido (mínimo 5 caracteres).')
      return
    }
    startTransition(async () => {
      try {
        unwrapSafeAction(
          await createCorrecaoAction({
            inspectionItemId: itemAtual.id,
            description: descricao.trim(),
            photos: fotos,
          }),
        )
        toast.success('Correção registrada. O item voltou para conforme.')
        reiniciar()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a correção.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {etapa === 'unidade' && (
        <>
          <Panel
            title="Rota de Correção"
            description={
              podeOperar
                ? 'Selecione a unidade com pendência para registrar o reparo'
                : 'Você não tem acesso para registrar reparos neste módulo'
            }
          >
            {unidadesComPendencia.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-[var(--success)]" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma pendência em aberto. Tudo corrigido.
                </p>
              </div>
            ) : (
              <ol className="space-y-2">
                {unidadesComPendencia.map((r) => (
                  <li key={r.unidade.id}>
                    <button
                      onClick={() => escolherUnidade(r.unidade)}
                      disabled={!podeOperar}
                      title={!podeOperar ? 'Você não tem acesso para operar este módulo' : undefined}
                      className="flex w-full items-center gap-4 rounded-xl border border-border/70 px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/12 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          Unidade {r.unidade.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.pendentes.length} {r.pendentes.length === 1 ? 'item pendente' : 'itens pendentes'}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            title="Correções recentes"
            description="Últimos reparos registrados"
          >
            {correcoesRecentes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma correção registrada ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {correcoesRecentes.map((c) => (
                  <div key={c.id} className="flex gap-3 rounded-xl border border-border/70 p-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--success)]/12 text-[var(--success)]">
                      <Wrench className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          Unidade {c.uhName}
                          {c.checklistItemName ? ` — ${c.checklistItemName}` : ''}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatarData(c.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                      {(c.authorName || c.photos.length > 0) && (
                        <div className="mt-2 flex items-center gap-3">
                          {c.authorName && (
                            <span className="text-xs text-muted-foreground">
                              por {c.authorName}
                            </span>
                          )}
                          {c.photos.length > 0 && (
                            <div className="flex gap-1.5">
                              {c.photos.slice(0, 3).map((url) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={url}
                                  src={url}
                                  alt="Evidência do reparo"
                                  className="h-8 w-8 rounded-md border border-border/70 object-cover"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {etapa === 'item' && unidadeAtual && (
        <div className="mx-auto max-w-xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Unidade {unidadeAtual.name}
              </p>
              <p className="text-xs text-muted-foreground">Selecione o item a corrigir</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reiniciar} className="rounded-xl">
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>

          <Panel>
            <ol className="space-y-2">
              {itensPendentesDaUnidade.map((it) => {
                const catalogo = it.checklistItemId ? itensPorId.get(it.checklistItemId) : null
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => escolherItem(it)}
                      className="flex w-full items-start gap-3 rounded-xl border border-border/70 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="min-w-0 flex-1">
                        {catalogo && (
                          <Badge
                            variant="outline"
                            className="mb-1.5"
                            style={{ borderColor: corCategoria(catalogo.category), color: corCategoria(catalogo.category) }}
                          >
                            {catalogo.category}
                          </Badge>
                        )}
                        <p className="text-sm font-medium">
                          {catalogo?.name ?? 'Item removido do catálogo'}
                        </p>
                        {it.comment && (
                          <p className="mt-1 text-xs text-muted-foreground">{it.comment}</p>
                        )}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ol>
          </Panel>
        </div>
      )}

      {etapa === 'descricao' && unidadeAtual && itemAtual && (
        <div className="mx-auto max-w-xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Unidade {unidadeAtual.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {itemAtual.checklistItemId ? itensPorId.get(itemAtual.checklistItemId)?.name : 'Item'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEtapa('item')} className="rounded-xl">
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>

          <Panel className="space-y-4">
            {itemAtual.comment && (
              <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">Problema relatado na inspeção</p>
                <p className="mt-1 text-sm">{itemAtual.comment}</p>
              </div>
            )}

            {itemAtual.checklistItemId && (
              <ItemInfoField
                uhId={unidadeAtual.id}
                checklistItemId={itemAtual.checklistItemId}
                initialInfo={
                  itemInfos.find(
                    (i) => i.uhId === unidadeAtual.id && i.checklistItemId === itemAtual.checklistItemId,
                  )?.info ?? null
                }
                podeOperar={podeOperar}
                logs={itemInfoLogs.filter(
                  (l) => l.uhId === unidadeAtual.id && l.checklistItemId === itemAtual.checklistItemId,
                )}
              />
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                O que foi feito para corrigir? *
              </label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva o reparo realizado"
                className="min-h-24 rounded-xl"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Foto (opcional)
              </label>
              <div className="flex flex-wrap gap-2">
                {fotos.map((url) => (
                  <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border/70">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Evidência do reparo" className="h-full w-full object-cover" />
                    <button
                      onClick={() => setFotos((f) => f.filter((p) => p !== url))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-foreground/70 p-0.5 text-background opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remover foto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {fotos.length < MAX_FOTOS && (
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
          </Panel>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={reiniciar}
              disabled={pending}
              className="h-11 flex-1 rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={pending || descricao.trim().length < 5}
              className="h-11 flex-1 rounded-xl"
            >
              <History className="h-4 w-4" />
              {pending ? 'Salvando...' : 'Registrar correção'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
