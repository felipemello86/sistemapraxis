import { Poppins } from "next/font/google";

// Layout com parallel route @modal — necessário pro popup de lead (ver
// @modal/(.)[leadId]/page.tsx). `children` é a rota normal (board, etapas,
// campos, ou a página cheia de um lead); `modal` só renderiza algo quando a
// rota interceptadora bate.
//
// Também aplicada aqui (30/07/2026, pedido do Felipe): a marca e a
// tipografia Century Gothic em todas as telas do CRM. Century Gothic é uma
// fonte licenciada da Monotype — só renderiza pra quem já tem ela instalada
// no sistema (comum em máquinas com Office/Windows), não dá pra embutir na
// web. Poppins entra atrás como substituta pra quem não tem: é a geométrica
// gratuita mais parecida (mesmo "O" bem redondo, mesmas proporções largas).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  display: "swap",
  variable: "--praxis-fallback-crm",
});

const FONTE = `'Century Gothic', var(--praxis-fallback-crm), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

export default function CrmLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <div className={poppins.variable} style={{ fontFamily: FONTE }}>
      <div style={{ padding: "max(16px, env(safe-area-inset-top)) 24px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/praxis-logo.png" alt="Praxis" style={{ height: 20, width: "auto", display: "block" }} />
      </div>
      {children}
      {modal}
    </div>
  );
}
