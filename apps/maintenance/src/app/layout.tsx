import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getSession } from "@praxis/core";
import { Toaster } from "@/components/ui/sonner";
import PushTapHandler from "./PushTapHandler";
import "./globals.css";

// Portado de apps/maintenance/src/app/layout.tsx (v1), sem <Providers>
// (era só o SessionProvider do NextAuth, que não existe mais nesta v2 — ver
// comentário em components/dashboard.tsx) e sem @vercel/analytics (nenhum
// outro app da v2 usa, não valia trazer só pra este).
export const metadata: Metadata = {
  title: "Manutenção — Praxis",
  description: "Gestão de inspeções preventivas e manutenção de unidades.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Async só por causa do tenantSlug pro PushTapHandler (deep link cross-app
// — ver comentário lá e em lib/pushDestino.ts). page.tsx já busca a própria
// sessão de novo (com redirect se ausente) — aqui só lemos o tenantSlug,
// sem redirect nenhum, mesmo padrão do layout.tsx raiz do Housekeeping.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-center" />
        <PushTapHandler tenantSlug={session?.tenantSlug} />
      </body>
    </html>
  );
}
