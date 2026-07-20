import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Praxis",
  description: "Suíte integrada de excelência operacional hoteleira.",
  // O ícone auto-detectado (src/app/icon.png) é 1024x1024 — sem um link
  // explícito pra um ícone pequeno, o Chrome às vezes recusa exibi-lo na
  // barra de favoritos e cai no globo cinza padrão. favicon.ico (em
  // public/, com 16x16/32x32/48x48 embutidos) resolve isso.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "1024x1024" },
    ],
    shortcut: "/favicon.ico",
  },
};

// viewport-fit=cover precisa estar aqui (não em metadata) pra env(safe-area-inset-*)
// funcionar dentro do wrapper nativo — mesma lição já aprendida na v1.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f5f5f7" }}>
        {children}
      </body>
    </html>
  );
}
