"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ClipboardList,
  ShieldCheck,
  BedDouble,
  Menu,
  X,
  ListChecks,
  LayoutDashboard,
  BarChart3,
  Settings,
  ScrollText,
  FileText,
  Building2,
  LayoutGrid,
  Wrench,
  Star,
  Package,
  UtensilsCrossed,
  Sparkles,
  Lock,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/components/layout/Sidebar.tsx (v1).
// Diferenças desta fatia:
//   - Sem next-auth: recebe nome/role/tenantSlug já resolvidos por prop
//     (vêm da sessão lida no layout.tsx de cada rota, via @praxis/core).
//   - Sem "Sair" — login/logout ficam centralizados só no gateway (mesma
//     decisão de arquitetura de todo o resto da suíte); aqui só tem "Home"
//     pra voltar ao hub, onde a pessoa pode sair se quiser.
//   - hotelNome vira tenantSlug (não busca /api/configuracoes, que não
//     existe em v2 ainda).

// Marca Praxis — path absoluto com o basePath deste app embutido de
// propósito: Next.js não prefixa sozinho <img src="/..."> com o basePath
// (só faz isso pra assets gerados pelo próprio build), mesma razão do
// apiFetch.ts hardcodar BASE_PATH.
const MARK_SRC = "/governance/praxis-mark.png";

// `roles` ausente = visível pra todo mundo (comportamento de sempre).
// "Falhas Gerenciais" é restrito a Gerente/Master + Governanta (que é quem
// registra a falha). "Decisão de Bloqueio" é restrito às 4 roles notificadas
// quando uma NC urgente é registrada (Atendimento/Gerente/Governanta/Master
// — ver packages/core/src/maintenanceUrgente.ts); só Atendimento/Gerente/
// Master decidem de fato (gate de podeOperar dentro da própria tela).
const navItems: { href: string; icon: typeof LayoutDashboard; label: string; roles?: string[] }[] = [
  { href: "/dashboard",  icon: LayoutDashboard, label: "Tempo Real" },
  { href: "/camareira",  icon: ListChecks,    label: "Minhas UHs" },
  { href: "/selecao",    icon: BedDouble,     label: "Seleção e Liberação" },
  { href: "/atribuicao", icon: ClipboardList, label: "Atribuição Diária" },
  { href: "/governanta", icon: ShieldCheck,   label: "Inspeções" },
  { href: "/falhas-gerenciais", icon: Building2, label: "Falhas Gerenciais", roles: ["GOVERNANTA", "GERENTE", "MASTER"] },
  { href: "/decisao-bloqueio", icon: Lock, label: "Decisão de Bloqueio", roles: ["ATENDIMENTO", "GERENTE", "GOVERNANTA", "MASTER"] },
  { href: "/movimentos", icon: BarChart3,     label: "Performance" },
  { href: "/logs",       icon: ScrollText,    label: "Log do Sistema" },
  { href: "/relatorios", icon: FileText,      label: "Relatórios" },
  { href: "/configuracoes", icon: Settings,   label: "Configurações" },
];

function hubUrl(tenantSlug: string) {
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br";
  return tenantSlug ? `${base}/${tenantSlug}` : base;
}

// Pedido explícito do Felipe: o botão "Home" (que levava pro hub) vira a
// própria marca Praxis (ver <a href={hubUrl(...)}> em volta do MARK_SRC
// abaixo); no lugar dele entra um dropdown "trocar de módulo", que leva
// direto pra outro módulo sem passar pelo hub. Lista vem de /api/modulos
// (client-side, ver ModuleSwitcher) — depende de acesso por usuário, não só
// por tenant (getAccessibleModules em @praxis/core).
type ModuloDisponivel = { module: string; slug: string; label: string };

const MODULE_ICONS: Record<string, typeof BedDouble> = {
  HOUSEKEEPING: BedDouble,
  MAINTENANCE: Wrench,
  BOOKING_REVIEWS: Star,
  STOCK: Package,
  RESTAURANT: UtensilsCrossed,
  INTELLIGENCE: Sparkles,
};

// Slug deste próprio app — pra não listar "Governança" entre as opções de
// troca (a pessoa já está aqui). Mesmo valor do BASE_PATH de lib/apiFetch.ts.
const MODULO_ATUAL_SLUG = "governance";

function ModuleSwitcher({
  tenantSlug, variant, panelPosition = "up", align = "left",
}: { tenantSlug: string; variant: "full" | "icon"; panelPosition?: "up" | "down"; align?: "left" | "right" }) {
  const [modulos, setModulos] = useState<ModuloDisponivel[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch("/api/modulos")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const lista = Array.isArray(data) ? (data as ModuloDisponivel[]) : [];
        setModulos(lista.filter((m) => m.slug !== MODULO_ATUAL_SLUG));
      })
      .catch(() => {});
  }, []);

  if (modulos.length === 0) return null;

  const painelClasse = `${panelPosition === "up" ? "bottom-full mb-2" : "top-full mt-2"} ${align === "left" ? "left-0" : "right-0"}`;

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} aria-hidden />}
      {variant === "full" ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm w-full transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          Trocar de módulo
        </button>
      ) : (
        <button onClick={() => setOpen((v) => !v)} title="Trocar de módulo" className="text-gray-400 hover:text-gray-700 p-2 rounded">
          <LayoutGrid className="w-4 h-4" />
        </button>
      )}
      {open && (
        <div className={`absolute z-50 ${painelClasse} w-56 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-200`}>
          {modulos.map(({ module, slug, label }) => {
            const Icon = MODULE_ICONS[module] ?? LayoutGrid;
            return (
              <a
                key={module}
                href={`${hubUrl(tenantSlug)}/${slug}`}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Preferência de sidebar recolhida persistida em cookie (não localStorage) —
// cada rota deste módulo tem seu próprio layout.tsx (Server Component), e
// trocar de rota troca de layout, o que desmonta e remonta a Sidebar do
// zero. Com localStorage, o valor só era lido DEPOIS do mount (pra não
// divergir do HTML renderizado no servidor), então toda navegação
// renderizava expandida por um instante e só depois "recolhia sozinha" — é
// exatamente o bug relatado pelo Felipe. Com cookie, o layout.tsx de cada
// rota já lê o valor no servidor (ver `cookies()` em cada layout.tsx) e
// passa como prop `initialCollapsed`, então a Sidebar já nasce no estado
// certo, sem flash. Como todos os módulos ficam no mesmo domínio via
// rewrite do gateway (basePaths diferentes, mesma origem), a chave leva o
// nome do módulo pra não colidir com a mesma preferência de
// housekeeping/estoque/restaurante/upkeep.
const SIDEBAR_COLLAPSED_KEY = "praxis-housekeeping-sidebar-collapsed";

function NavContent({
  nome, role, tenantSlug, pathname, onClose, collapsible,
}: {
  nome: string; role: string; tenantSlug: string; pathname: string;
  onClose?: () => void; collapsible?: boolean;
}) {
  return (
    <>
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* Marca vira o botão Home (pedido explícito do Felipe) — leva pro
              hub, onde a pessoa vê todos os módulos e pode sair. */}
          <a href={hubUrl(tenantSlug)} title="Ir pro hub" className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_SRC} alt="Praxis" className="w-7 h-7 object-contain rounded-md" />
          </a>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate text-gray-900">{tenantSlug}</p>
            <p className="text-gray-400 text-xs">Governança</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 ml-2 flex-shrink-0" title={collapsible ? "Recolher menu" : "Fechar"}>
            {collapsible ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.filter((item) => !item.roles || item.roles.includes(role)).map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-gray-100 text-gray-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
            {nome?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{nome}</p>
            <p className="text-xs text-gray-400 capitalize">{role.toLowerCase()}</p>
          </div>
        </div>
        <ModuleSwitcher tenantSlug={tenantSlug} variant="full" />
      </div>
    </>
  );
}

export function Sidebar({
  nome, role, tenantSlug, initialCollapsed,
}: { nome: string; role: string; tenantSlug: string; initialCollapsed?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Default real é "estendido" (pedido explícito do Felipe) — só nasce
  // recolhida se o layout.tsx da rota leu "1" do cookie no servidor (ver
  // comentário em SIDEBAR_COLLAPSED_KEY acima), ou seja, se a última escolha
  // da pessoa foi recolher.
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function setCollapsedPersist(next: boolean) {
    setCollapsed(next);
    // path=/ pra valer em todas as rotas deste módulo; 1 ano de validade.
    document.cookie = `${SIDEBAR_COLLAPSED_KEY}=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
  }

  const navProps = { nome, role, tenantSlug, pathname };

  return (
    <>
      {/* sticky + h-screen (em vez de min-h-screen) prende a sidebar no
          topo da viewport durante a rolagem — sem isso ela era só mais um
          item do flex, então rolava junto com o <main> quando a lista de
          UHs era mais alta que a tela. */}
      <aside className={`hidden md:flex sticky top-0 bg-white border-r border-gray-200 flex-col h-screen flex-shrink-0 transition-all duration-200 ${collapsed ? "w-14" : "w-60"}`}>
        {collapsed ? (
          <div className="flex flex-col h-full">
            <div className="p-2 flex justify-center border-b border-gray-100">
              <button onClick={() => setCollapsedPersist(false)} className="text-gray-400 hover:text-gray-700 p-1.5 rounded">
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-1 flex flex-col items-center">
              {navItems.filter((item) => !item.roles || item.roles.includes(role)).map(({ href, icon: Icon, label }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link key={href} href={href} title={label}
                    className={`p-2.5 rounded-lg transition-colors ${active ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
                    <Icon className="w-5 h-5" />
                  </Link>
                );
              })}
            </nav>
            <div className="p-2 border-t border-gray-100 flex flex-col items-center gap-1">
              <ModuleSwitcher tenantSlug={tenantSlug} variant="icon" panelPosition="up" />
            </div>
          </div>
        ) : (
          <NavContent {...navProps} onClose={() => setCollapsedPersist(true)} collapsible />
        )}
      </aside>

      {/* No app nativo (Capacitor/iOS), esse header fixo ficava por trás da
          barra de status/notch ao rolar a tela — o WKWebView não desloca
          elementos `fixed` pela safe area sozinho. `env(safe-area-inset-top)`
          resolve o valor real do notch porque o layout raiz já declara
          viewport-fit=cover (ver app/layout.tsx). O conteúdo que compensa
          essa altura extra fica em `.hk-content-offset` (globals.css),
          usado no lugar de `pt-14 md:pt-0` em cada layout.tsx de rota — não
          dá pra empurrar com um elemento espaçador aqui porque o container
          pai é `flex` em linha (sidebar à esquerda no desktop), não em
          coluna. */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 text-gray-900 flex items-center justify-between px-4 shadow-sm"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <a href={hubUrl(tenantSlug)} title="Ir pro hub" className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_SRC} alt="Praxis" className="w-6 h-6 object-contain rounded" />
          </a>
          <span className="font-bold text-sm truncate text-gray-900">{tenantSlug}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <ModuleSwitcher tenantSlug={tenantSlug} variant="icon" panelPosition="down" align="right" />
          <button onClick={() => setMobileOpen(true)} className="text-gray-500 hover:text-gray-900 p-1" aria-label="Abrir menu">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside
            className="relative w-72 max-w-[85vw] bg-white text-gray-900 flex flex-col h-full shadow-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <NavContent {...navProps} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
