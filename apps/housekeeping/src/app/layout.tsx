import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <PushTapHandler />
      </body>
    </html>
  );
}
