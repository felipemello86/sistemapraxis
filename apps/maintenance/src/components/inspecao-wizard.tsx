'use client'

import { useState, useTransition } from 'react'
import {
  Check,
  AlertTriangle,
  Ban,
  Camera,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  ClipboardList,
  History,
} from 'lucide-react'
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
import { Panel, StatCard } from '@/components/ui-kit'
import { toast } from 'sonner'
import { corCategoria } from '@/lib/domain'
import { createInspecaoAction, removerItemIncompativelAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import { apiFetch } from '@/lib/apiFetch'
import type { ChecklistItem, UnitOption } from '@/lib/types'

// Fluxo gamificado item a item (execução + resumo), extraído de
// rota-manutencao.tsx pra ser reaproveitado também no "Nova inspeção" de
// Controle de Inspeções — as duas entradas precisam do mesmo comportamento
// (avaliar item a item, com observação e foto na não conformidade), só o
// jeito de chegar até a unidade muda (rota priorizada vs. seleção manual).

const MAX_FOTOS_POR_ITEM = 4

type Resposta = {
  status: 'CONFORME' | 'NAO_CONFORME'
  comment: string
  photos: string[]
  // Só relevante quando status = NAO_CONFORME e o item NÃO é um carryover
  // (ver pendenciaAtual) — pra não conformidade nova, precisa responder as
  // duas antes de avançar/salvar (pedido explícito). null = ainda não
  // respondeu.
  needsMaterial: boolean | null
  needsExternalService: boolean | null
}

export function InspecaoWizard({
  unidade,
  itens: itensIniciais,
  pendenciasAtuais = {},
  onCancel,
  onSaved,
}: {
  unidade: UnitOption
  itens: ChecklistItem[]
  // Itens que constam como NAO_CONFORME na inspeção mais recente dessa UH
  // (não corrigidos ainda) — usado pra pré-preencher a tela de execução com
  // o relato atual em vez de partir de "Conforme" em branco. Ver comentário
  // em respostas abaixo.
  pendenciasAtuais?: Record<string, { comment: string; photos: string[] }>
  onCancel: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [etapa, setEtapa] = useState<'execucao' | 'resumo'>('execucao')
  const [indice, setIndice] = useState(0)
  // Cópia local, mutável — quando um item é marcado "incompatível" ele sai
  // dessa lista na hora (ver confirmarItemIncompativel), sem precisar
  // recarregar a página nem esperar o revalidatePath do server action.
  const [itens, setItens] = useState<ChecklistItem[]>(itensIniciais)
  // Item com não conformidade ainda em aberto (não corrigida) começa já
  // marcado "Não Conforme", com a descrição e as fotos do relato atual —
  // pedido do Felipe pra reinspeção não partir de "Conforme" às cegas pra
  // um problema que ninguém resolveu ainda. Editar a descrição ou trocar a
  // foto aqui não apaga o relato antigo: ao salvar, esta inspeção vira um
  // registro novo (MaintenanceInspection própria) — a antiga permanece
  // intacta no histórico (ver createInspecaoImpl em actions/data.ts).
  const [respostas, setRespostas] = useState<Record<string, Resposta>>(() =>
    Object.fromEntries(
      itensIniciais.map((it) => {
        const pendencia = pendenciasAtuais[it.id]
        return [
          it.id,
          pendencia
            ? {
                status: 'NAO_CONFORME' as const,
                comment: pendencia.comment,
                photos: pendencia.photos,
                needsMaterial: null,
                needsExternalService: null,
              }
            : { status: 'CONFORME' as const, comment: '', photos: [], needsMaterial: null, needsExternalService: null },
        ]
      }),
    ),
  )
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [confirmandoIncompativel, setConfirmandoIncompativel] = useState(false)
  const [removendoIncompativel, setRemovendoIncompativel] = useState(false)

  function marcar(itemId: string, status: 'CONFORME' | 'NAO_CONFORME') {
    setRespostas((r) => ({ ...r, [itemId]: { ...r[itemId], status } }))
  }

  function setComentario(itemId: string, comment: string) {
    setRespostas((r) => ({ ...r, [itemId]: { ...r[itemId], comment } }))
  }

  function setNeedsMaterial(itemId: string, needsMaterial: boolean) {
    setRespostas((r) => ({ ...r, [itemId]: { ...r[itemId], needsMaterial } }))
  }

  function setNeedsExternalService(itemId: string, needsExternalService: boolean) {
    setRespostas((r) => ({ ...r, [itemId]: { ...r[itemId], needsExternalService } }))
  }

  async function adicionarFotos(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return
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
        fd.append('pasta', `inspecoes/${unidade.name}`)
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

  // "Item incompatível" — falha de cadastro: esse item do checklist não se
  // aplica a esta UH. Remove do cadastro da UH (server) e da lista local
  // desta inspeção (client), sem precisar recarregar a tela.
  async function confirmarItemIncompativel() {
    const item = itens[indice]
    if (!item) return
    setRemovendoIncompativel(true)
    try {
      unwrapSafeAction(
        await removerItemIncompativelAction({ uhId: unidade.id, checklistItemId: item.id }),
      )
      setRespostas((r) => {
        const resto = { ...r }
        delete resto[item.id]
        return resto
      })
      const eraOUltimo = indice >= itens.length - 1
      setItens((prev) => prev.filter((it) => it.id !== item.id))
      toast.success(`"${item.name}" removido do cadastro desta UH.`)
      setConfirmandoIncompativel(false)
      // O item saiu da lista, então o índice atual já aponta pro próximo
      // item automaticamente (o array encolheu por baixo dele). Só precisa
      // ir pro resumo explicitamente se o removido era o último.
      if (eraOUltimo) {
        setEtapa('resumo')
      }
    } catch {
      toast.error('Não foi possível remover o item.')
    } finally {
      setRemovendoIncompativel(false)
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
    if (novoIndice >= itens.length) {
      setEtapa('resumo')
      return
    }
    setIndice(novoIndice)
  }

  function salvarInspecao() {
    const itensPayload = itens.map((it) => {
      const resp = respostas[it.id]
      return {
        checklistItemId: it.id,
        status: resp?.status ?? 'CONFORME',
        comment: resp?.status === 'NAO_CONFORME' ? resp.comment || undefined : undefined,
        photos: resp?.status === 'NAO_CONFORME' ? resp.photos : [],
        needsMaterial: resp?.status === 'NAO_CONFORME' ? resp.needsMaterial ?? undefined : undefined,
        needsExternalService: resp?.status === 'NAO_CONFORME' ? resp.needsExternalService ?? undefined : undefined,
      }
    })

    startTransition(async () => {
      try {
        unwrapSafeAction(
          await createInspecaoAction({ uhId: unidade.id, itens: itensPayload }),
        )
        toast.success('Inspeção registrada com sucesso.')
        onSaved()
      } catch {
        toast.error('Não foi possível salvar a inspeção.')
      }
    })
  }

  if (itens.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center text-sm text-muted-foreground">
        Essa unidade não tem itens de checklist atribuídos.
        <div className="mt-4">
          <Button variant="outline" onClick={onCancel} className="rounded-xl">
            Voltar
          </Button>
        </div>
      </div>
    )
  }

  // ── Etapa: execução item a item ─────────────────────────────────────────
  if (etapa === 'execucao') {
    const item = itens[indice]
    const resp = respostas[item.id]
    const progresso = ((indice + 1) / itens.length) * 100
    const naoConforme = resp?.status === 'NAO_CONFORME'
    const pendenciaAtual = pendenciasAtuais[item.id]

    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Unidade {unidade.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Item {indice + 1} de {itens.length}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-xl">
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
          {itens.map((it, i) => {
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
          <div className="flex items-start justify-between gap-3">
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
            <button
              onClick={() => setConfirmandoIncompativel(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Ban className="h-3.5 w-3.5" />
              Item incompatível
            </button>
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
              {pendenciaAtual && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/40 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
                  <span>
                    Este item já consta como <strong className="text-foreground">não conforme</strong> desde a
                    última inspeção — a descrição e as fotos abaixo são o relato atual. Altere se necessário; o
                    registro anterior permanece no histórico.
                  </span>
                </div>
              )}
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

              {/* Carryover (pendenciaAtual) já tem card de Correção em
                  andamento — não faz sentido re-perguntar. Só pergunta pra
                  não conformidade genuinamente nova (pedido explícito: toda
                  não conformidade nova precisa informar as duas flags antes
                  de concluir o registro). */}
              {!pendenciaAtual && (
                <div className="space-y-3 border-t border-[var(--warning)]/30 pt-3">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Precisa adquirir algum material? *
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setNeedsMaterial(item.id, true)}
                        className={`rounded-xl border-2 py-2 text-sm font-medium transition-colors ${
                          resp?.needsMaterial === true
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => setNeedsMaterial(item.id, false)}
                        className={`rounded-xl border-2 py-2 text-sm font-medium transition-colors ${
                          resp?.needsMaterial === false
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        Não
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Precisa contratar serviço externo? *
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setNeedsExternalService(item.id, true)}
                        className={`rounded-xl border-2 py-2 text-sm font-medium transition-colors ${
                          resp?.needsExternalService === true
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => setNeedsExternalService(item.id, false)}
                        className={`rounded-xl border-2 py-2 text-sm font-medium transition-colors ${
                          resp?.needsExternalService === false
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        Não
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Dialog open={confirmandoIncompativel} onOpenChange={setConfirmandoIncompativel}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Item incompatível com esta UH?</DialogTitle>
              <DialogDescription>
                Se você confirmar, &quot;{item.name}&quot; será removido do cadastro de
                checklist da UH {unidade.name} — ele não aparece mais em inspeções futuras
                dessa unidade (pode ser adicionado de volta depois em Configurações). A
                inspeção segue direto pro próximo item.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmandoIncompativel(false)}
                disabled={removendoIncompativel}
                className="rounded-xl"
              >
                Desistir
              </Button>
              <Button
                variant="destructive"
                onClick={confirmarItemIncompativel}
                disabled={removendoIncompativel}
                className="rounded-xl"
              >
                {removendoIncompativel ? 'Removendo...' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
            disabled={
              naoConforme &&
              (!resp?.comment?.trim() ||
                (!pendenciaAtual && (resp?.needsMaterial === null || resp?.needsExternalService === null)))
            }
            className="h-11 flex-1 rounded-xl"
          >
            {indice === itens.length - 1 ? 'Ver resumo' : 'Próximo'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Etapa: resumo final ─────────────────────────────────────────────────
  const naoConformes = itens.filter((it) => respostas[it.id]?.status === 'NAO_CONFORME')
  const conformes = itens.length - naoConformes.length
  const pct = Math.round((conformes / itens.length) * 100)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Resumo — Unidade {unidade.name}
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
          onClick={onCancel}
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
