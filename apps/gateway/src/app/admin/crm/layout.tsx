import { Mulish } from "next/font/google";

// Layout com parallel route @modal — necessário pro popup de lead (ver
// @modal/(.)[leadId]/page.tsx). `children` é a rota normal (board, etapas,
// campos, ou a página cheia de um lead); `modal` só renderiza algo quando a
// rota interceptadora bate.
//
// Também aplicada aqui (30/07/2026, pedido do Felipe): a marca e a
// tipografia Avenir Next em todas as telas do CRM. Avenir Next só existe em
// Mac/iOS (fonte licenciada da Apple, não dá pra embutir na web) — Mulish
// entra atrás como substituta em Windows/Android, mesmo esquema já usado na
// landing page pública (apps/gateway/src/app/page.tsx).
const mulish = Mulish({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  display: "swap",
  variable: "--praxis-fallback-crm",
});

const FONTE = `'Avenir Next', 'Avenir', var(--praxis-fallback-crm), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

export default function CrmLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <div className={mulish.variable} style={{ fontFamily: FONTE }}>
      <div style={{ padding: "max(16px, env(safe-area-inset-top)) 24px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/praxis-logo.png" alt="Praxis" style={{ height: 20, width: "auto", display: "block" }} />
      </div>
      {children}
      {modal}
    </div>
  );
}
