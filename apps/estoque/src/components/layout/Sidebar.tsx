"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Package, ArrowLeftRight, Menu, X, Home, LayoutDashboard } from "lucide-react";

// Mesmo padrão do Sidebar do housekeeping (ver
// apps/housekeeping/src/components/layout/Sidebar.tsx): sem next-auth,
// recebe nome/role/tenantSlug já resolvidos por prop; sem "Sair" (login/
// logout ficam centralizados no gateway); header mobile fixo com
// env(safe-area-inset-top) pro notch/status bar do app nativo.

// Marca Praxis — path absoluto com o basePath deste app embutido de
// propósito: Next.js não prefixa sozinho <img src="/..."> com o basePath
// (só faz isso pra assets gerados pelo próprio build, tipo _next/static),
// mesma razão do apiFetch.ts hardcodar BASE_PATH.
const MARK_SRC = "/estoque/praxis-mark.png";

const navItems = [
  { href: "/dashboard",  icon: LayoutDashboard, label: "Dashboard" },
  { href: "/produtos",   icon: Package,         label: "Produtos" },
  { href: "/movimentos", icon: ArrowLeftRight,  label: "Movimentações" },
];

function hubUrl(tenantSlug: string) {
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br";
  return tenantSlug ? `${base}/${tenantSlug}` : base;
}

// Preferência de sidebar recolhida persistida por navegador (localStorage) —
// como todos os módulos ficam no mesmo domínio via rewrite do gateway
// (basePaths diferentes, mesma origem), a chave leva o nome do módulo pra
// não colidir com a mesma preferência de housekeeping/estoque/restaurante/
// upkeep. Mesmo padrão introduzido em apps/maintenance/src/components/dashboard.tsx.
const SIDEBAR_COLLAPSED_KEY = "praxis-estoque-sidebar-collapsed";

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="Praxis" className="w-7 h-7 object-contain rounded-md flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate text-gray-900">{tenantSlug}</p>
            <p className="text-gray-400 text-xs">Estoque</p>
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
        <a href={hubUrl(tenantSlug)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm w-full transition-colors">
          <Home className="w-4 h-4" />
          Home
        </a>
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
      <aside className={`hidden md:flex bg-white border-r border-gray-200 flex-col min-h-screen flex-shrink-0 transition-all duration-200 ${collapsed ? "w-14" : "w-60"}`}>
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
                    className={`p-2.5 rounded-lg transition-colors ${active ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
                    <Icon className="w-5 h-5" />
                  </Link>
                );
              })}
            </nav>
            <div className="p-2 border-t border-gray-100 flex flex-col items-center gap-1">
              <a href={hubUrl(tenantSlug)} title="Home" className="text-gray-400 hover:text-gray-700 p-2 rounded">
                <Home className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : (
          <NavContent {...navProps} onClose={() => setCollapsedPersist(true)} collapsible />
        )}
      </aside>

      {/* Header mobile fixo — mesma lição do housekeeping: no app nativo
          (Capacitor/iOS) precisa de env(safe-area-inset-top) pro notch/
          status bar, e o conteúdo compensa via .estoque-content-offset
          (globals.css), não um spacer em fluxo (container pai é flex-row). */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 text-gray-900 flex items-center justify-between px-4 shadow-sm"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="Praxis" className="w-6 h-6 object-contain rounded flex-shrink-0" />
          <span className="font-bold text-sm truncate text-gray-900">{tenantSlug}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a href={hubUrl(tenantSlug)} className="text-gray-500 hover:text-gray-900 p-1" aria-label="Home">
            <Home className="w-5 h-5" />
          </a>
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
