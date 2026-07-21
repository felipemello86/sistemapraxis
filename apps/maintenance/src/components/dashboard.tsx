'use client'

import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  TrendingUp,
  Route,
  Wrench,
  Settings,
  Menu,
  X,
  Home,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar'
import type {
  AtribuicoesPorUnidade,
  CorrectionSummary,
  DashboardUser,
  InspecaoComUnidade,
  ChecklistItem,
  MaintenanceConfigView,
  UnitOption,
  ViewId,
} from '@/lib/types'
import { VisaoGerencial } from '@/components/views/visao-gerencial'
import { Evolucao } from '@/components/views/evolucao'
import { Informacoes } from '@/components/views/informacoes'
import { RotaCorrecao } from '@/components/views/correcao'
import { Configuracoes } from '@/components/views/configuracoes'

// Portado de apps/maintenance/src/components/dashboard.tsx (v1). Diferenças:
//   - Sem next-auth (signOut, useRouter pro pós-logout): login/logout ficam
//     só no gateway, mesma decisão de arquitetura do resto da suíte (ver
//     comentário equivalente em housekeeping/src/components/layout/Sidebar.tsx)
//     — aqui só sobra o link "Home" pra voltar ao hub.
//   - Sem o useEffect de emitir/renovar cookie SSO: era ponte da v1 entre a
//     sessão local NextAuth e o cookie compartilhado; nesta v2 só existe UM
//     cookie de sessão (praxis_v2_session), sem ponte nenhuma pra fazer.

// Ficou apontando pro domínio v1 (praxis-systems.com.br) — o app nativo
// (Capacitor) só permite navegação dentro de sistemaspraxis.com.br
// (allowNavigation em apps/mobile-app/capacitor.config.ts), então esse link
// era rejeitado pelo WKWebView e o iOS jogava a navegação pro Safari em vez
// de manter dentro do app. Mesmo padrão de apps/housekeeping/src/components/layout/Sidebar.tsx.
function hubUrl(tenantSlug?: string) {
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://sistemaspraxis.com.br'
  return tenantSlug ? `${base}/${tenantSlug}` : base
}

// Marca Praxis — path absoluto com o basePath deste app embutido de
// propósito: Next.js não prefixa sozinho <img src="/..."> com o basePath
// (só faz isso pra assets gerados pelo próprio build), mesma razão do
// apiFetch.ts hardcodar BASE_PATH nos outros módulos.
const MARK_SRC = '/upkeep/praxis-mark.png'

// Só afeta o rail no desktop (md+) — no mobile a sidebar continua sendo o
// overlay de tela cheia controlado por `mobileOpen`, colapsar não faz
// sentido ali. Preferência persistida por navegador (não por usuário).
const SIDEBAR_COLLAPSED_KEY = 'praxis-maintenance-sidebar-collapsed'

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'gerencial', label: 'Visão Gerencial', icon: LayoutDashboard },
  { id: 'evolucao', label: 'Evolução', icon: TrendingUp },
  { id: 'informacoes', label: 'Inspeções', icon: Route },
  { id: 'correcao', label: 'Rota de Correção', icon: Wrench },
  { id: 'config', label: 'Configurações', icon: Settings },
]

export function Dashboard({
  user,
  unidades,
  itens,
  inspecoes,
  atribuicoes,
  correcoes,
  config,
}: {
  user: DashboardUser
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  atribuicoes: AtribuicoesPorUnidade
  correcoes: CorrectionSummary[]
  config: MaintenanceConfigView
}) {
  const [view, setView] = useState<ViewId>('gerencial')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Lido depois do mount (não no useState inicial) pra não divergir do HTML
  // renderizado no servidor — evita mismatch de hidratação.
  useEffect(() => {
    if (window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
      setCollapsed(true)
    }
  }, [])

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  const iniciais = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  function go(id: ViewId) {
    setView(id)
    setMobileOpen(false)
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border/70 bg-sidebar/80 backdrop-blur-xl transition-[transform,width] duration-300 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-16' : 'md:w-64',
        )}
        // No app nativo (Capacitor/iOS), `env()` resolve pra 0 em navegador
        // comum (desktop), então esse padding só afeta mesmo o app nativo —
        // sem ele o logo ficava colado atrás do notch/status bar quando o
        // menu mobile abre. Mesma causa raiz do fix em
        // apps/housekeeping/src/components/layout/Sidebar.tsx.
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Botão de colapsar — só faz sentido no desktop (md+); no mobile a
            sidebar já é um overlay de tela cheia controlado por mobileOpen. */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="absolute -right-3 top-20 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground md:flex"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        <div className={cn('flex h-16 items-center gap-3', collapsed ? 'justify-center px-2' : 'px-5')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="Praxis" className="h-8 w-8 shrink-0 object-contain rounded-md" />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{user.tenantSlug || 'Praxis'}</p>
              <p className="text-xs text-muted-foreground">Manutenção</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex w-full items-center rounded-xl py-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate text-pretty">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-border/70 p-3">
          <a
            href={hubUrl(user.tenantSlug)}
            title={collapsed ? 'Home' : undefined}
            className={cn(
              'mb-1 flex w-full items-center rounded-xl py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              collapsed ? 'justify-center px-0' : 'gap-3 px-2',
            )}
          >
            <Home className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && 'Home'}
          </a>
          <div className={cn('flex items-center rounded-xl py-2', collapsed ? 'justify-center px-0' : 'gap-3 px-2')}>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-accent text-xs font-semibold text-foreground">
                {iniciais}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Conteúdo */}
      <div className={cn('flex flex-1 flex-col transition-[padding] duration-300', collapsed ? 'md:pl-16' : 'md:pl-64')}>
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/70 bg-background/70 px-4 backdrop-blur-xl md:px-8"
          style={{ height: 'calc(4rem + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight">
              {NAV.find((n) => n.id === view)?.label}
            </h1>
          </div>
          <a
            href={hubUrl(user.tenantSlug)}
            aria-label="Home"
            title="Home"
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Home className="h-5 w-5" />
          </a>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {view === 'gerencial' && (
            <VisaoGerencial
              unidades={unidades}
              itens={itens}
              inspecoes={inspecoes}
              meta={config.goal}
            />
          )}
          {view === 'evolucao' && <Evolucao inspecoes={inspecoes} />}
          {view === 'informacoes' && (
            <Informacoes
              unidades={unidades}
              itens={itens}
              inspecoes={inspecoes}
              atribuicoes={atribuicoes}
              maxDias={config.maxDaysBetweenInspections}
            />
          )}
          {view === 'correcao' && (
            <RotaCorrecao
              unidades={unidades}
              itens={itens}
              inspecoes={inspecoes}
              correcoesRecentes={correcoes}
            />
          )}
          {view === 'config' && (
            <Configuracoes
              itens={itens}
              unidades={unidades}
              atribuicoes={atribuicoes}
              config={config}
              user={user}
            />
          )}
        </main>
      </div>
    </div>
  )
}
