"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutGrid, BedDouble, Wrench, Star, Package, UtensilsCrossed, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

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

// Slug deste próprio app — pra não listar "Avaliações" entre as opções de
// troca (a pessoa já está aqui). Mesmo valor do BASE_PATH de lib/apiFetch.ts.
const MODULO_ATUAL_SLUG = "reviews";

function ModuleSwitcher({ tenantSlug }: { tenantSlug: string }) {
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

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} aria-hidden />}
      <button onClick={() => setOpen((v) => !v)} title="Trocar de módulo" className="text-slate-500 hover:text-slate-800 p-1">
        <LayoutGrid className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute z-50 top-full right-0 mt-2 w-56 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200">
          {modulos.map(({ module, slug, label }) => {
            const Icon = MODULE_ICONS[module] ?? LayoutGrid;
            return (
              <a
                key={module}
                href={`${hubUrl(tenantSlug)}/${slug}`}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
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
            {/* Marca vira o botão Home (pedido explícito do Felipe) — leva
                pro hub, onde a pessoa vê todos os módulos e pode sair. */}
            <a href={hubUrl(tenantSlug)} title="Ir pro hub" className="flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MARK_SRC} alt="Praxis" className="w-6 h-6 object-contain" />
            </a>
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
          <ModuleSwitcher tenantSlug={tenantSlug} />
        </div>
      </div>
    </header>
  );
}
