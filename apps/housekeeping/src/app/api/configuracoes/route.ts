import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/configuracoes/route.ts (v1).
// hotelId → tenantId; hotelConfig → HkConfig; hotel.nome → tenant.name (v2
// não tem model Hotel separado — Tenant já é a entidade única).

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada pra qualquer usuário do tenant, mesmo sem acesso
  // ao módulo — só escrita (PUT abaixo) continua gateada por hasModuleAccess.
  // Ver comentário em apps/maintenance/src/app/page.tsx.
  const tenantId = session.tenantId;

  const config = await prisma.hkConfig.findUnique({ where: { tenantId } });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return NextResponse.json({ ...config, hotelNome: tenant?.name });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const { notificationTime, targetMinutes, photoRequirements, hotelNome, turnoInicioHora } = await req.json();

  const config = await prisma.hkConfig.upsert({
    where: { tenantId },
    update: { notificationTime, targetMinutes, photoRequirements: JSON.stringify(photoRequirements), turnoInicioHora },
    create: { tenantId, notificationTime, targetMinutes, photoRequirements: JSON.stringify(photoRequirements), turnoInicioHora },
  });

  if (hotelNome) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { name: hotelNome } });
  }

  return NextResponse.json(config);
}
