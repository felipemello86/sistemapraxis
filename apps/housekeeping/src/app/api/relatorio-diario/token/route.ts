import { NextResponse } from "next/server";
import { getSession, signDownloadToken } from "@praxis/core";

// GET /api/relatorio-diario/token — minta um token de vida curta (5min) pra
// abrir o PDF do relatório no Safari do sistema, fora do WebView do app.
//
// Por que existe: "Baixar PDF" precisava sair do WebView (Capacitor abre
// target="_blank" no Safari) porque o WKWebView não expõe um jeito
// confiável de salvar um blob/download — mas o cookie de sessão é httpOnly
// e escopado ao WebView, então o Safari abre sem estar autenticado (ver
// signDownloadToken em packages/core/src/session.ts). Minerado sob demanda
// no clique do botão, não junto da listagem de relatórios — evita expirar
// se a pessoa ficar navegando a tela antes de clicar em "Baixar PDF".
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await signDownloadToken(session.tenantId);
  return NextResponse.json({ token });
}
