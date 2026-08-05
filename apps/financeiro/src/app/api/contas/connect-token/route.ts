import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, criarConnectToken } from "@praxis/core";

// Gera o connectToken que o front-end usa pra abrir o widget Pluggy
// Connect (ver pluggy.ts). 501 (não 500) quando as credenciais ainda não
// existem — é um estado esperado enquanto o Felipe não cria a conta em
// dashboard.pluggy.ai, não uma falha do sistema.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { itemId } = await req.json().catch(() => ({ itemId: undefined }));

  try {
    const accessToken = await criarConnectToken(itemId);
    return NextResponse.json({ accessToken });
  } catch (e: any) {
    if (String(e.message).includes("PLUGGY_CLIENT")) {
      return NextResponse.json({ error: "Pluggy ainda não configurado nesta conta." }, { status: 501 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
