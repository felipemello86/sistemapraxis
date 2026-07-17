"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ClipboardList,
  Hotel,
  ShieldCheck,
  BedDouble,
  Menu,
  X,
  Home,
  ListChecks,
  LayoutDashboard,
  BarChart3,
  Settings,
  ScrollText,
} from "lucide-react";

// Portado de apps/housekeeping/src/components/layout/Sidebar.tsx (v1).
// Diferenças desta fatia:
//   - Sem next-auth: recebe nome/role/tenantSlug já resolvidos por prop
//     (vêm da sessão lida no layout.tsx de cada rota, via @praxis/core).
//   - Sem "Sair" — login/logout ficam centralizados só no gateway (mesma
//     decisão de arquitetura de todo o resto da suíte); aqui só tem "Home"
//     pra voltar ao hub, onde a pessoa pode sair se quiser.
//   - Nav lista só as telas que já existem nesta reconstrução. Relatórios
//     ainda não foi portado — ver task própria.
//   - hotelNome vira tenantSlug (não busca /api/configuracoes, que não
//     existe em v2 ainda).

const navItems = [
  { href: "/dashboard",  icon: LayoutDashboard, label: "Tempo Real" },
  { href: "/camareira",  icon: ListChecks,    label: "Minhas UHs" },
  { href: "/selecao",    icon: BedDouble,     label: "Seleção e Liberação" },
  { href: "/atribuicao", icon: ClipboardList, label: "Atribuição Diária" },
  { href: "/governanta", icon: ShieldCheck,   label: "Inspeções" },
  { href: "/movimentos", icon: BarChart3,     label: "Performance" },
  { href: "/logs",       icon: ScrollText,    label: "Log do Sistema" },
  { href: "/configuracoes", icon: Settings,   label: "Configurações" },
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
      <div className="p-5 border-b border-blue-800 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Hotel className="w-6 h-6 text-blue-300 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{tenantSlug}</p>
            <p className="text-blue-400 text-xs">Governança</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-blue-300 hover:text-white ml-2 flex-shrink-0" title={collapsible ? "Recolher menu" : "Fechar"}>
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
                active ? "bg-blue-700 text-white" : "text-blue-200 hover:bg-blue-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-blue-800">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
            {nome?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{nome}</p>
            <p className="text-xs text-blue-400 capitalize">{role.toLowerCase()}</p>
          </div>
        </div>
        <a href={hubUrl(tenantSlug)} className="flex items-center gap-2 text-blue-300 hover:text-white text-sm w-full transition-colors">
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

  const navProps = { nome, role, tenantSlug, pathname };

  return (
    <>
      <aside className={`hidden md:flex bg-blue-900 text-white flex-col min-h-screen flex-shrink-0 transition-all duration-200 ${collapsed ? "w-14" : "w-60"}`}>
        {collapsed ? (
          <div className="flex flex-col h-full">
            <div className="p-2 flex justify-center border-b border-blue-800">
              <button onClick={() => setCollapsed(false)} className="text-blue-300 hover:text-white p-1.5 rounded">
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-1 flex flex-col items-center">
              {navItems.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link key={href} href={href} title={label}
                    className={`p-2.5 rounded-lg transition-colors ${active ? "bg-blue-700 text-white" : "text-blue-200 hover:bg-blue-800 hover:text-white"}`}>
                    <Icon className="w-5 h-5" />
                  </Link>
                );
              })}
            </nav>
            <div className="p-2 border-t border-blue-800 flex flex-col items-center gap-1">
              <a href={hubUrl(tenantSlug)} title="Home" className="text-blue-300 hover:text-white p-2 rounded">
                <Home className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : (
          <NavContent {...navProps} onClose={() => setCollapsed(true)} collapsible />
        )}
      </aside>

      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-blue-900 text-white flex items-center justify-between px-4 h-14 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <Hotel className="w-5 h-5 text-blue-300 flex-shrink-0" />
          <span className="font-bold text-sm truncate">{tenantSlug}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a href={hubUrl(tenantSlug)} className="text-blue-200 hover:text-white p-1" aria-label="Home">
            <Home className="w-5 h-5" />
          </a>
          <button onClick={() => setMobileOpen(true)} className="text-blue-200 hover:text-white p-1" aria-label="Abrir menu">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-blue-900 text-white flex flex-col h-full shadow-xl">
            <NavContent {...navProps} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
