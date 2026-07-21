'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Plus,
  Trash2,
  Building2,
  ListChecks,
  LayoutGrid,
  Timer,
  UserCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Panel } from '@/components/ui-kit'
import { toast } from 'sonner'
import { corCategoria } from '@/lib/domain'
import { CATEGORIAS } from '@/lib/default-data'
import {
  createItemAction,
  deleteItemAction,
  setAtribuicaoUnidadeAction,
  updateConfigAction,
} from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import type {
  AtribuicoesPorUnidade,
  DashboardUser,
  ChecklistItem,
  MaintenanceConfigView,
  UnitOption,
} from '@/lib/types'

// Portado de apps/maintenance/src/components/views/configuracoes.tsx (v1),
// bem reduzido: a aba "Unidades" virou um redirect pro cadastro único de UH
// no gateway (mesma decisão já tomada em Governança/Avaliações — ver
// RedirectTab em apps/housekeeping/src/app/configuracoes/ConfiguracoesClient.tsx)
// e a aba "Conta" ficou só com os dados da própria sessão (sem CRUD de
// usuário aqui — isso também é só no gateway). A única aba que continua com
// CRUD de verdade nesta tela é o catálogo de itens de inspeção.
function RedirectCard({
  titulo,
  descricao,
  path,
  tenantSlug,
}: {
  titulo: string
  descricao: string
  path: string
  tenantSlug?: string
}) {
  // Mesmo bug do hubUrl em dashboard.tsx: domínio v1 aqui era rejeitado pelo
  // allowNavigation do app nativo e jogava a navegação pro Safari.
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://sistemaspraxis.com.br'
  const href = tenantSlug ? `${base}/${tenantSlug}/${path}` : base
  return (
    <Panel title={titulo} description={descricao}>
      <a href={href}>
        <Button className="h-10 rounded-xl">
          <ExternalLink className="h-4 w-4" />
          Ir pro hub
        </Button>
      </a>
    </Panel>
  )
}

export function Configuracoes({
  itens,
  unidades,
  atribuicoes,
  config,
  user,
}: {
  itens: ChecklistItem[]
  unidades: UnitOption[]
  atribuicoes: AtribuicoesPorUnidade
  config: MaintenanceConfigView
  user: DashboardUser
}) {
  const [pending, startTransition] = useTransition()

  const [itemNome, setItemNome] = useState('')
  const [itemCategoria, setItemCategoria] = useState<string>(CATEGORIAS[0])
  const [itemDescricao, setItemDescricao] = useState('')

  // ── Atribuição de itens por UH ──────────────────────────────────────────
  const [uhExpandida, setUhExpandida] = useState<string | null>(null)
  const [selecaoAtual, setSelecaoAtual] = useState<Record<string, boolean>>({})

  function abrirAtribuicao(uhId: string) {
    if (uhExpandida === uhId) {
      setUhExpandida(null)
      return
    }
    const customizado = atribuicoes[uhId]
    const marcados = customizado && customizado.length > 0 ? new Set(customizado) : null
    setSelecaoAtual(
      Object.fromEntries(itens.map((it) => [it.id, marcados ? marcados.has(it.id) : true])),
    )
    setUhExpandida(uhId)
  }

  function salvarAtribuicao(uhId: string) {
    const checklistItemIds = itens.filter((it) => selecaoAtual[it.id]).map((it) => it.id)
    if (checklistItemIds.length === 0) {
      toast.error('Selecione ao menos um item, ou use "Restaurar padrão".')
      return
    }
    startTransition(async () => {
      try {
        unwrapSafeAction(await setAtribuicaoUnidadeAction({ uhId, checklistItemIds }))
        toast.success('Atribuição salva.')
        setUhExpandida(null)
      } catch {
        toast.error('Erro ao salvar atribuição.')
      }
    })
  }

  function restaurarPadrao(uhId: string) {
    startTransition(async () => {
      try {
        unwrapSafeAction(await setAtribuicaoUnidadeAction({ uhId, checklistItemIds: [] }))
        toast.success('Restaurado — todos os itens se aplicam.')
        setUhExpandida(null)
      } catch {
        toast.error('Erro ao restaurar padrão.')
      }
    })
  }

  // ── Prazo & meta ─────────────────────────────────────────────────────────
  const [maxDias, setMaxDias] = useState(String(config.maxDaysBetweenInspections))
  const [meta, setMeta] = useState(String(config.goal))

  function salvarConfig() {
    const maxDiasNum = Number(maxDias)
    const metaNum = Number(meta)
    if (!Number.isFinite(maxDiasNum) || maxDiasNum < 1 || maxDiasNum > 365) {
      toast.error('Prazo deve estar entre 1 e 365 dias.')
      return
    }
    if (!Number.isFinite(metaNum) || metaNum < 0 || metaNum > 100) {
      toast.error('Meta deve estar entre 0 e 100%.')
      return
    }
    startTransition(async () => {
      try {
        unwrapSafeAction(
          await updateConfigAction({ maxDaysBetweenInspections: maxDiasNum, goal: metaNum }),
        )
        toast.success('Configuração salva.')
      } catch {
        toast.error('Erro ao salvar configuração.')
      }
    })
  }

  const totalCustomizadas = useMemo(
    () => Object.values(atribuicoes).filter((ids) => ids.length > 0).length,
    [atribuicoes],
  )

  function addItem() {
    if (!itemNome.trim()) {
      toast.error('Informe o nome do item.')
      return
    }
    startTransition(async () => {
      try {
        unwrapSafeAction(
          await createItemAction({
            name: itemNome.trim(),
            category: itemCategoria,
            subDescription: itemDescricao.trim() || undefined,
          }),
        )
        toast.success('Item adicionado ao catálogo.')
        setItemNome('')
        setItemDescricao('')
      } catch {
        toast.error('Erro ao adicionar item.')
      }
    })
  }

  function removeItem(id: string) {
    startTransition(async () => {
      try {
        unwrapSafeAction(await deleteItemAction(id))
        toast.success('Item removido.')
      } catch {
        toast.error('Erro ao remover item.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="itens" className="w-full">
        <TabsList className="rounded-xl bg-muted p-1">
          <TabsTrigger value="unidades" className="rounded-lg">
            <Building2 className="h-4 w-4" />
            Unidades
          </TabsTrigger>
          <TabsTrigger value="itens" className="rounded-lg">
            <ListChecks className="h-4 w-4" />
            Itens
          </TabsTrigger>
          <TabsTrigger value="atribuicao" className="rounded-lg">
            <LayoutGrid className="h-4 w-4" />
            Atribuição
          </TabsTrigger>
          <TabsTrigger value="prazo" className="rounded-lg">
            <Timer className="h-4 w-4" />
            Prazo &amp; Meta
          </TabsTrigger>
          <TabsTrigger value="conta" className="rounded-lg">
            <UserCircle className="h-4 w-4" />
            Conta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unidades" className="mt-6">
          <RedirectCard
            titulo="Cadastro de UHs mudou de lugar"
            descricao="Criar, editar e desativar UHs agora é feito em um lugar só, no hub — válido para Governança, Manutenção e Avaliações."
            path="configuracoes/uhs"
            tenantSlug={user.tenantSlug}
          />
        </TabsContent>

        {/* Itens */}
        <TabsContent value="itens" className="mt-6 space-y-6">
          <Panel title="Adicionar item de inspeção">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="itemNome">Nome do item</Label>
                <Input
                  id="itemNome"
                  value={itemNome}
                  onChange={(e) => setItemNome(e.target.value)}
                  placeholder="Ex.: Verificação do ar-condicionado"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Categoria</Label>
                <Select
                  value={itemCategoria}
                  onValueChange={(v) => setItemCategoria(v ?? CATEGORIAS[0])}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="desc">Descrição (opcional)</Label>
                <Input
                  id="desc"
                  value={itemDescricao}
                  onChange={(e) => setItemDescricao(e.target.value)}
                  placeholder="Detalhe adicional"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={addItem}
                disabled={pending}
                className="h-10 rounded-xl"
              >
                <Plus className="h-4 w-4" />
                Adicionar item
              </Button>
            </div>
          </Panel>

          <Panel
            title="Catálogo de itens"
            description={`${itens.length} itens cadastrados`}
          >
            <ul className="divide-y divide-border/70">
              {itens.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: corCategoria(it.category) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.category}
                      {it.subDescription ? ` · ${it.subDescription}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    disabled={pending}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remover item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        {/* Atribuição de itens por UH */}
        <TabsContent value="atribuicao" className="mt-6 space-y-6">
          <Panel
            title="Atribuição de itens por unidade"
            description={
              totalCustomizadas === 0
                ? 'Nenhuma UH customizada — hoje todos os itens do catálogo se aplicam a todas as unidades.'
                : `${totalCustomizadas} de ${unidades.length} unidades com lista customizada.`
            }
          >
            {unidades.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma unidade cadastrada. Cadastre UHs no hub primeiro.
              </p>
            ) : itens.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Cadastre itens no catálogo (aba "Itens") antes de configurar a atribuição.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {unidades.map((u) => {
                  const customizado = atribuicoes[u.id] && atribuicoes[u.id].length > 0
                  const aberta = uhExpandida === u.id
                  return (
                    <li key={u.id} className="py-2.5">
                      <button
                        onClick={() => abrirAtribuicao(u.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/50"
                      >
                        {aberta ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          Unidade {u.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            customizado
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border bg-muted text-muted-foreground'
                          }
                        >
                          {customizado ? `${atribuicoes[u.id].length} itens` : 'Todos os itens'}
                        </Badge>
                      </button>

                      {aberta && (
                        <div className="ml-7 mt-3 space-y-3 rounded-xl border border-border/70 p-3">
                          <div className="max-h-72 space-y-1.5 overflow-y-auto">
                            {itens.map((it) => (
                              <label
                                key={it.id}
                                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={selecaoAtual[it.id] ?? false}
                                  onChange={(e) =>
                                    setSelecaoAtual((s) => ({ ...s, [it.id]: e.target.checked }))
                                  }
                                  className="h-4 w-4 rounded border-border accent-primary"
                                />
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: corCategoria(it.category) }}
                                />
                                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => restaurarPadrao(u.id)}
                              disabled={pending}
                              className="rounded-lg"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restaurar padrão
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => salvarAtribuicao(u.id)}
                              disabled={pending}
                              className="rounded-lg"
                            >
                              Salvar
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </TabsContent>

        {/* Prazo & Meta */}
        <TabsContent value="prazo" className="mt-6">
          <Panel
            title="Prazo entre inspeções e meta de conformidade"
            description="Critérios específicos da Manutenção — não afetam outros módulos"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-md">
              <div className="flex flex-col gap-2">
                <Label htmlFor="maxDias">Prazo máximo entre inspeções (dias)</Label>
                <Input
                  id="maxDias"
                  type="number"
                  min={1}
                  max={365}
                  value={maxDias}
                  onChange={(e) => setMaxDias(e.target.value)}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Unidades além desse prazo entram no card "Pendentes" em Inspeções.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="meta">Meta de conformidade (%)</Label>
                <Input
                  id="meta"
                  type="number"
                  min={0}
                  max={100}
                  value={meta}
                  onChange={(e) => setMeta(e.target.value)}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Referência exibida na Visão Gerencial.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={salvarConfig} disabled={pending} className="h-10 rounded-xl">
                Salvar configuração
              </Button>
            </div>
          </Panel>
        </TabsContent>

        {/* Conta */}
        <TabsContent value="conta" className="mt-6">
          <Panel title="Sua conta">
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <Label className="text-muted-foreground">Nome</Label>
                <p className="text-sm font-medium">{user.name}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-muted-foreground">E-mail</Label>
                <p className="text-sm font-medium">{user.email}</p>
              </div>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
