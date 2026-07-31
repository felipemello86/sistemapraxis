import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Alimenta a tela de Calendário (dia x UH) — agrupa Property > UH e traz os
// eventos que caem dentro do intervalo pedido: Reserva (com uhId já
// preenchido — reserva sem alocação física não aparece aqui, só na lista
// /reservas) e BloqueioDisponibilidade. Continua Fase 1 (só leitura).
//
// Comparação de intervalo usa string YYYY-MM-DD direto (sem Date) — mesmo
// padrão do resto do schema, funciona porque esse formato ordena
// lexicograficamente igual a cronologicamente.

function addDaysIso(iso: string, dias: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RECEPTION"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const hoje = new Date().toISOString().slice(0, 10);
  const inicio = searchParams.get("inicio") || addDaysIso(hoje, -1);
  const fim = searchParams.get("fim") || addDaysIso(inicio, 21);

  const [properties, reservas, bloqueios] = await Promise.all([
    prisma.property.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        uhs: {
          where: { ativo: true },
          orderBy: [{ ordem: "asc" }, { numero: "asc" }],
          select: { id: true, numero: true, tipo: true },
        },
      },
    }),
    prisma.reserva.findMany({
      where: {
        tenantId: session.tenantId,
        uhId: { not: null },
        status: { not: "CANCELADA" },
        checkInData: { lt: fim },
        checkOutData: { gt: inicio },
      },
      select: {
        id: true,
        uhId: true,
        checkInData: true,
        checkOutData: true,
        canal: true,
        status: true,
        hospede: { select: { nome: true, telefone: true } },
      },
    }),
    prisma.bloqueioDisponibilidade.findMany({
      where: {
        tenantId: session.tenantId,
        dataInicio: { lt: fim },
        dataFim: { gt: inicio },
      },
      select: {
        id: true,
        uhId: true,
        dataInicio: true,
        dataFim: true,
        motivo: true,
        descricao: true,
        criadoPorNome: true,
      },
    }),
  ]);

  const eventos = [
    ...reservas.map((r) => ({
      id: r.id,
      tipo: "RESERVA" as const,
      uhId: r.uhId as string,
      checkIn: r.checkInData,
      checkOut: r.checkOutData,
      canal: r.canal,
      status: r.status,
      hospedeNome: r.hospede.nome,
      hospedeTelefone: r.hospede.telefone,
    })),
    ...bloqueios.map((b) => ({
      id: b.id,
      tipo: "BLOQUEIO" as const,
      uhId: b.uhId,
      checkIn: b.dataInicio,
      checkOut: b.dataFim,
      motivo: b.motivo,
      descricao: b.descricao,
      criadoPorNome: b.criadoPorNome,
    })),
  ];

  return NextResponse.json({ inicio, fim, properties, eventos });
}
