import type { Metadata, Viewport } from "next";
import { getSession } from "@praxis/core";
import "./globals.css";
import PushTapHandler from "./PushTapHandler";

export const metadata: Metadata = {
  title: "Governança — Praxis",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Async só por causa do tenantSlug pro PushTapHandler (deep link
// cross-app — ver comentário lá e em lib/pushDestino.ts). Cada rota já
// busca a própria sessão de novo no seu layout.tsx (redirect se ausente,
// ver ex. governanta/layout.tsx) — aqui só lemos o tenantSlug, sem redirect
// nenhum, porque o layout raiz também envolve páginas sem sessão (ex. algum
// erro de auth antes do redirect terminar).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="pt-BR">
      <body>
        {children}
        <PushTapHandler tenantSlug={session?.tenantSlug} />
      </body>
    </html>
  );
}
