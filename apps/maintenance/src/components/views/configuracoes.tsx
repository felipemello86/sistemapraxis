'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Building2, ListChecks, UserCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { createItemAction, deleteItemAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import type { DashboardUser, ChecklistItem } from '@/lib/types'

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
  user,
}: {
  itens: ChecklistItem[]
  user: DashboardUser
}) {
  const [pending, startTransition] = useTransition()

  const [itemNome, setItemNome] = useState('')
  const [itemCategoria, setItemCategoria] = useState<string>(CATEGORIAS[0])
  const [itemDescricao, setItemDescricao] = useState('')

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
