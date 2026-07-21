import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { format } from "date-fns";
import { distanciaMetros, HAVERSINE_RAIO_METROS } from "@/lib/geo";

// Georreferenciamento (Governança) — check-in de chegada da camareira.
// Chamado periodicamente pelo GeoCheckin (componente client, ver
// components/camareira/GeoCheckin.tsx) enquanto ela usa o app nativo.
//
// O cliente só manda a coordenada crua; quem decide em qual Property ela
// "chegou" é este endpoint — compara contra todas as Properties das UHs
// atribuídas a ela hoje (pode ter mais de uma) e grava GeoArrival pra
// qualquer uma dentro do raio de tolerância.
//
// Idempotente por dia: @@unique([tenantId, data, camareiraId, propertyId])
// no schema + upsert com update:{} abaixo garantem que chegadaEm sempre
// fica com o horário da PRIMEIRA confirmação dentro do raio, não a mais
// recente (senão a camareira saindo e voltando da property "resetaria" a
// hora de chegada, o que abriria margem pra manipular o relógio de
// disponibilidade — ver scores/route.ts).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { latitude, longitude } = await req.json();
  if (typeof latitude !== "number" || typeof longitude !== "number" || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
  }

  const tenantId = session.tenantId;
  const camareiraId = session.userId;
  const hoje = format(new Date(), "yyyy-MM-dd");

  const atribuicoesHoje = await prisma.dailyAssignment.findMany({
    where: { tenantId, camareiraId, data: hoje },
    select: {
      uh: {
        select: {
          property: { select: { id: true, latitude: true, longitude: true } },
        },
      },
    },
  });

  // Dedup por property — várias UHs da mesma camareira podem cair na mesma
  // Property no mesmo dia.
  const propriedades = new Map<string, { latitude: number; longitude: number }>();
  for (const a of atribuicoesHoje) {
    const p = a.uh.property;
    if (p.latitude == null || p.longitude == null) continue; // sem coordenada cadastrada — degrada, ver comentário no schema
    propriedades.set(p.id, { latitude: p.latitude, longitude: p.longitude });
  }

  const chegadas: { propertyId: string; distanciaMetros: number }[] = [];

  for (const [propertyId, coords] of propriedades) {
    const dist = distanciaMetros(latitude, longitude, coords.latitude, coords.longitude);
    if (dist > HAVERSINE_RAIO_METROS) continue;

    await prisma.geoArrival.upsert({
      where: {
        tenantId_data_camareiraId_propertyId: { tenantId, data: hoje, camareiraId, propertyId },
      },
      create: {
        tenantId,
        data: hoje,
        camareiraId,
        propertyId,
        chegadaEm: new Date(),
        distanciaMetros: dist,
      },
      update: {}, // preserva a primeira chegada do dia — não sobrescreve
    });
    chegadas.push({ propertyId, distanciaMetros: Math.round(dist) });
  }

  return NextResponse.json({ ok: true, chegadas });
}
