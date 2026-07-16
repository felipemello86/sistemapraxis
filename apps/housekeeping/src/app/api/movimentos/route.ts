import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";
import { format, startOfMonth, endOfMonth } from "date-fns";

// Portado de apps/housekeeping/src/app/api/movimentos/route.ts (v1). hotelId → tenantId.
// GET /api/movimentos?periodo=hoje|mes|alltime|custom&data=yyyy-MM-dd&dataIni=&dataFim=
// Retorna dados de tempo por etapa, por camareira
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = session.tenantId;

  const p = req.nextUrl.searchParams;
  const periodo = p.get("periodo") || "alltime";
  const dataCliente = p.get("data") || format(new Date(), "yyyy-MM-dd");

  let assignmentWhere: Record<string, unknown> = {
    program: { tipo: { not: "LIMPEZA_COMPLETA" } },
  };

  if (periodo === "hoje") {
    assignmentWhere.data = dataCliente;
  } else if (periodo === "mes") {
    const base = new Date(dataCliente + "T12:00:00");
    assignmentWhere.data = {
      gte: format(startOfMonth(base), "yyyy-MM-dd"),
      lte: format(endOfMonth(base), "yyyy-MM-dd"),
    };
  } else if (periodo === "custom") {
    const ini = p.get("dataIni");
    const fim = p.get("dataFim");
    if (ini && fim) assignmentWhere.data = { gte: ini, lte: fim };
  }

  // PASSO 1: buscar IDs de sessões válidas (finalizadas, não excluídas do score)
  // Fazemos em 2 queries separadas para garantir que o filtro excluidoDoScore seja aplicado
  const sessoesValidas = await prisma.cleaningSession.findMany({
    where: {
      camareira: { tenantId, ativo: true },
      finalizadaEm: { not: null },
      excluidoDoScore: false,
      assignment: assignmentWhere,
    },
    select: { id: true, camareiraId: true, camareira: { select: { nome: true } } },
  });

  if (sessoesValidas.length === 0) {
    return NextResponse.json({ steps: [], camareiras: [] });
  }

  const validIds = sessoesValidas.map((s) => s.id);
  const camMap = Object.fromEntries(
    sessoesValidas.map((s) => [s.id, { id: s.camareiraId, nome: s.camareira.nome }])
  );

  // PASSO 2: buscar os steps dessas sessões válidas
  const sessionSteps = await prisma.sessionStep.findMany({
    where: {
      sessionId: { in: validIds },
      duracaoSegundos: { not: null },
    },
    include: {
      step: { select: { titulo: true, ordem: true } },
    },
    orderBy: { step: { ordem: "asc" } },
  });

  if (sessionSteps.length === 0) {
    return NextResponse.json({ steps: [], camareiras: [] });
  }

  // Coleta steps ordenados
  const stepsMap = new Map<string, { titulo: string; ordem: number }>();
  for (const ss of sessionSteps) {
    if (!stepsMap.has(ss.step.titulo)) {
      stepsMap.set(ss.step.titulo, { titulo: ss.step.titulo, ordem: ss.step.ordem });
    }
  }
  const steps = Array.from(stepsMap.values()).sort((a, b) => a.ordem - b.ordem);

  // Agrupa por camareira → por step
  type StepAcum = { total: number; count: number };
  const porCamareira = new Map<string, { nome: string; steps: Map<string, StepAcum> }>();

  for (const ss of sessionSteps) {
    const cam = camMap[ss.sessionId];
    if (!cam) continue;
    const stepTitulo = ss.step.titulo;
    const dur = ss.duracaoSegundos ?? 0;

    if (!porCamareira.has(cam.id)) {
      porCamareira.set(cam.id, { nome: cam.nome, steps: new Map() });
    }
    const camEntry = porCamareira.get(cam.id)!;
    if (!camEntry.steps.has(stepTitulo)) {
      camEntry.steps.set(stepTitulo, { total: 0, count: 0 });
    }
    const st = camEntry.steps.get(stepTitulo)!;
    st.total += dur;
    st.count += 1;
  }

  // Monta resposta
  const camareiras = Array.from(porCamareira.entries()).map(([id, cam]) => ({
    id,
    nome: cam.nome,
    steps: steps.map((s) => {
      const acum = cam.steps.get(s.titulo);
      return {
        titulo: s.titulo,
        mediaSegundos: acum ? Math.round(acum.total / acum.count) : null,
        count: acum?.count ?? 0,
      };
    }),
  })).sort((a, b) => a.nome.localeCompare(b.nome));

  return NextResponse.json({ steps, camareiras });
}
