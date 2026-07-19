"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X, Home, KanbanSquare, Link2, Settings } from "lucide-react";

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="Praxis" className="w-8 h-8 object-contain rounded-md flex-shrink-0" />
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
        <a href={hubUrl(tenantSlug)} className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <Home className="w-[18px] h-[18px]" />
          Home
        </a>
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

  const navProps = { nome, role, tenantSlug, pathname };

  return (
    <>
      <aside className={`hidden md:flex sticky top-0 bg-white border-r border-gray-200 flex-col h-screen flex-shrink-0 transition-all duration-200 ${collapsed ? "w-14" : "w-60"}`}>
        {collapsed ? (
          <div className="flex flex-col h-full">
            <div className="p-2 flex justify-center border-b border-gray-100">
              <button onClick={() => setCollapsed(false)} className="text-gray-400 hover:text-gray-700 p-1.5 rounded">
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
              <a href={hubUrl(tenantSlug)} title="Home" className="text-gray-400 hover:text-gray-700 p-2 rounded">
                <Home className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : (
          <NavContent {...navProps} onClose={() => setCollapsed(true)} collapsible />
        )}
      </aside>

      {/* Header mobile fixo — safe-area pro app nativo, mesmo padrão dos
          outros módulos, só que claro. */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 text-gray-900 flex items-center justify-between px-4 shadow-sm"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="Praxis" className="w-7 h-7 object-contain rounded flex-shrink-0" />
          <span className="font-semibold text-sm truncate">{tenantSlug}</span>
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
