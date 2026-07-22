import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/uh-detail/route.ts (v1). hotelId → tenantId.
// GET /api/uh-detail?assignmentId=xxx
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.

  const assignmentId = req.nextUrl.searchParams.get("assignmentId");
  if (!assignmentId) return NextResponse.json({ error: "assignmentId obrigatório" }, { status: 400 });

  const assignment = await prisma.dailyAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      uh: { select: { numero: true } },
      camareira: { select: { nome: true } },
      cleaningSession: {
        include: {
          steps: {
            include: { step: { select: { titulo: true } } },
            orderBy: { ordem: "asc" },
          },
          inspection: {
            include: {
              itens: { orderBy: { ordem: "asc" } },
            },
          },
        },
      },
    },
    // relationJoins ligado no schema compartilhado (ver
    // packages/core/prisma/schema.prisma).
    relationLoadStrategy: "join",
  });

  if (!assignment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const cs = assignment.cleaningSession;

  const falhasLavanderia = await prisma.falhaLavanderia.findMany({
    where: { tenantId: assignment.tenantId, uhNumero: assignment.uh.numero, data: assignment.data },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      descricao: true,
      reportadoPorNome: true,
      reportadoPorRole: true,
      fotoUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    uhNumero: assignment.uh.numero,
    camareiraNome: assignment.camareira.nome,
    status: assignment.status,
    liberadaEm: assignment.liberadaEm,
    session: cs
      ? {
          iniciadaEm: cs.iniciadaEm,
          finalizadaEm: cs.finalizadaEm,
          duracaoSegundos: cs.duracaoSegundos,
          fotos: (() => { try { return JSON.parse(cs.fotos); } catch { return []; } })(),
          observacoes: cs.observacoes,
          comentarioCamareira: cs.comentarioCamareira,
          steps: cs.steps.map((s) => ({
            nome: s.step.titulo,
            ordem: s.ordem,
            iniciadoEm: s.iniciadoEm,
            finalizadoEm: s.finalizadoEm,
            duracaoSegundos: s.duracaoSegundos,
          })),
          inspection: cs.inspection
            ? {
                iniciadaEm: cs.inspection.iniciadaEm,
                finalizadaEm: cs.inspection.finalizadaEm,
                totalFalhas: cs.inspection.totalFalhas,
                comentarioGovernanta: cs.inspection.comentarioGovernanta,
                itens: cs.inspection.itens.map((i) => ({
                  categoria: i.categoria,
                  item: i.item,
                  resultado: i.resultado,
                  tipoFalha: i.tipoFalha,
                  observacao: i.observacao,
                })),
              }
            : null,
        }
      : null,
    falhasLavanderia: falhasLavanderia.map((f) => ({
      id: f.id,
      descricao: f.descricao,
      reportadoPorNome: f.reportadoPorNome,
      reportadoPorRole: f.reportadoPorRole,
      fotoUrl: f.fotoUrl,
      hora: new Date(f.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
    })),
  });
}
