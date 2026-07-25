"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X, KanbanSquare, Link2, Settings, LayoutGrid, BedDouble, Wrench, Star, Package, UtensilsCrossed, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Estilo alinhado ao módulo Manutenção (pedido do Felipe): sidebar CLARA e
// neutra (branca, bordas sutis), item ativo como pill escuro — em vez do
// padrão de sidebar colorida escura dos módulos estoque/housekeeping.
// Estrutura/comportamento (collapse, header mobile com safe-area) continuam
// os mesmos do padrão estoque.

const MARK_SRC = "/restaurante/praxis-mark.png";

const navItems = [
  { href: "/kanban", icon: KanbanSquare, label: "Pedidos (Kanban)" },
  { href: "/links", icon: Link2, label: "Gerar Link" },
  { href: "/configuracoes", icon: Settings, label: "Configurações" },
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
// por tenant (getAccessibleModules em @praxis/core). Mesmo padrão de
// apps/housekeeping/src/components/layout/Sidebar.tsx.
type ModuloDisponivel = { module: string; slug: string; label: string };

const MODULE_ICONS: Record<string, typeof BedDouble> = {
  HOUSEKEEPING: BedDouble,
  MAINTENANCE: Wrench,
  BOOKING_REVIEWS: Star,
  STOCK: Package,
  RESTAURANT: UtensilsCrossed,
  INTELLIGENCE: Sparkles,
};

// Slug deste próprio app — pra não listar "Restaurante" entre as opções de
// troca (a pessoa já está aqui). Mesmo valor do BASE_PATH de lib/apiFetch.ts.
const MODULO_ATUAL_SLUG = "restaurante";

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
          className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors w-full"
        >
          <LayoutGrid className="w-[18px] h-[18px]" />
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

// Preferência de sidebar recolhida persistida por navegador (localStorage) —
// como todos os módulos ficam no mesmo domínio via rewrite do gateway
// (basePaths diferentes, mesma origem), a chave leva o nome do módulo pra
// não colidir com a mesma preferência de housekeeping/estoque/restaurante/
// upkeep. Mesmo padrão introduzido em apps/maintenance/src/components/dashboard.tsx.
const SIDEBAR_COLLAPSED_KEY = "praxis-restaurante-sidebar-collapsed";

function NavContent({
  nome, role, tenantSlug, pathname, onClose, collapsible,
}: {
  nome: string; role: string; tenantSlug: string; pathname: string;
  onClose?: () => void; collapsible?: boolean;
}) {
  return (
    <>
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Marca vira o botão Home (pedido explícito do Felipe) — leva pro
              hub, onde a pessoa vê todos os módulos e pode sair. */}
          <a href={hubUrl(tenantSlug)} title="Ir pro hub" className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_SRC} alt="Praxis" className="w-8 h-8 object-contain rounded-md" />
          </a>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate text-gray-900">{tenantSlug}</p>
            <p className="text-gray-400 text-xs">Restaurante</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 ml-2 flex-shrink-0" title={collapsible ? "Recolher menu" : "Fechar"}>
            {collapsible ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <ModuleSwitcher tenantSlug={tenantSlug} variant="full" />
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="w-9 h-9 bg-gray-100 text-gray-700 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {nome?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-sm font-medium truncate text-gray-900">{nome}</p>
            <p className="text-xs text-gray-400 capitalize">{role.toLowerCase()}</p>
          </div>
        </div>
      </div>
    </>
  );
}

export function Sidebar({ nome, role, tenantSlug }: { nome: string; role: string; tenantSlug: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lido depois do mount (não no useState inicial) pra não divergir do HTML
  // renderizado no servidor — evita mismatch de hidratação.
  useEffect(() => {
    if (window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
      setCollapsed(true);
    }
  }, []);

  function setCollapsedPersist(next: boolean) {
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  }

  const navProps = { nome, role, tenantSlug, pathname };

  return (
    <>
      <aside className={`hidden md:flex sticky top-0 bg-white border-r border-gray-200 flex-col h-screen flex-shrink-0 transition-all duration-200 ${collapsed ? "w-14" : "w-60"}`}>
        {collapsed ? (
          <div className="flex flex-col h-full">
            <div className="p-2 flex justify-center border-b border-gray-100">
              <button onClick={() => setCollapsedPersist(false)} className="text-gray-400 hover:text-gray-700 p-1.5 rounded">
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-1 flex flex-col items-center">
              {navItems.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link key={href} href={href} title={label}
                    className={`p-2.5 rounded-xl transition-colors ${active ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
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

      {/* Header mobile fixo — safe-area pro app nativo, mesmo padrão dos
          outros módulos, só que claro. */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 text-gray-900 flex items-center justify-between px-4 shadow-sm"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <a href={hubUrl(tenantSlug)} title="Ir pro hub" className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_SRC} alt="Praxis" className="w-7 h-7 object-contain rounded" />
          </a>
          <span className="font-semibold text-sm truncate">{tenantSlug}</span>
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
            className="relative w-72 max-w-[85vw] bg-white flex flex-col h-full shadow-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <NavContent {...navProps} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
