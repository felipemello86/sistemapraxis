"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";

// Portado de apps/booking-reviews/src/app/(app)/layout.tsx (v1) — lá o nav
// morava direto no layout (server component); aqui vira um client component
// à parte (mesmo motivo do Sidebar.tsx do housekeeping: precisa de
// usePathname() pra destacar o item ativo).
//
// Diferenças conscientes:
//   - Sem "Sair" — login/logout centralizados no gateway (mesmo padrão do
//     resto da suíte); só tem "Home" pra voltar ao hub.
//   - Sem SessionSync (bridge de SSO entre apps satélite) — v2 usa um único
//     cookie de sessão compartilhado, não precisa sincronizar nada.
//   - NAV_ITEMS lista só as telas que já existem nesta reconstrução —
//     Dashboard, Compromissos, Performance, Reuniões e Configurações entram
//     conforme forem portados (ver tasks da suíte Avaliações).

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tratamento", label: "Tratamento" },
  { href: "/compromissos", label: "Compromissos" },
  { href: "/desempenho", label: "Performance" },
  { href: "/reunioes", label: "Reuniões" },
  { href: "/configuracoes", label: "Configurações" },
];

function hubUrl(tenantSlug: string) {
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br";
  return tenantSlug ? `${base}/${tenantSlug}` : base;
}

// Marca Praxis — path absoluto com o basePath deste app embutido de
// propósito: Next.js não prefixa sozinho <img src="/..."> com o basePath
// (só faz isso pra assets gerados pelo próprio build), mesma razão do
// apiFetch.ts hardcodar BASE_PATH nos outros módulos.
const MARK_SRC = "/reviews/praxis-mark.png";

export function Header({ nome, role, tenantSlug }: { nome: string; role: string; tenantSlug: string }) {
  const pathname = usePathname();

  return (
    // No app nativo (Capacitor/iOS) esse header é o primeiro elemento da
    // página — sem esse padding, o nome do módulo/nav ficava atrás do
    // notch/status bar. `env()` resolve pra 0 em navegador comum, então não
    // afeta o layout web normal.
    <header className="border-b border-slate-200 bg-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-8 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_SRC} alt="Praxis" className="w-6 h-6 object-contain flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate">{tenantSlug}</p>
              <p className="text-xs text-slate-400">Avaliações</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1 -mx-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                    active ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="text-right">
            <div className="text-sm text-slate-700">{nome}</div>
            <div className="text-xs text-slate-400 capitalize">{role.toLowerCase()}</div>
          </div>
          <a href={hubUrl(tenantSlug)} className="text-slate-500 hover:text-slate-800 p-1" title="Home">
            <Home className="w-4 h-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
