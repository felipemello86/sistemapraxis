import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Praxis",
  description: "Suíte integrada de excelência operacional hoteleira.",
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
