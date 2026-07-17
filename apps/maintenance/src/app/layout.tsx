import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
