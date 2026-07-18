import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/push/register/route.ts (v1),
// adaptado pra sessão única (@praxis/core getSession) em vez de next-auth.
// Vive no gateway (não em housekeeping/maintenance/reviews) porque é aqui
// que o app nativo (Capacitor) abre primeiro — ver
// apps/gateway/src/app/[cliente]/PushRegistration.tsx, que chama este
// endpoint assim que a sessão existe. O token fica salvo no User
// (suite_core), então qualquer módulo pode mandar push pra ele depois via
// sendPushToUser (@praxis/core).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = body?.token as string | undefined;
  const platform = body?.platform as string | undefined;

  if (!token || !platform || !["ios", "android"].includes(platform)) {
    return NextResponse.json(
      { error: "Campos obrigatórios: token (string), platform ('ios' | 'android')" },
      { status: 400 },
    );
  }

  await prisma.pushToken.upsert({
    where: { token },
    create: { token, platform, userId: session.userId },
    // upsert em vez de create simples: cobre tanto reenvio do mesmo token
    // pelo mesmo usuário (idempotente) quanto o caso de aparelho
    // compartilhado/reinstalado, reatribuindo o token pro usuário atual.
    update: { userId: session.userId, platform },
  });

  return NextResponse.json({ ok: true });
}

// Chamado no logout, pra parar de mandar push pra quem saiu da conta nesse
// aparelho (sem isso, o token continuaria vinculado ao usuário anterior).
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = body?.token as string | undefined;
  if (!token) return NextResponse.json({ error: "Campo obrigatório: token" }, { status: 400 });

  await prisma.pushToken.deleteMany({
    where: { token, userId: session.userId },
  });

  return NextResponse.json({ ok: true });
}
