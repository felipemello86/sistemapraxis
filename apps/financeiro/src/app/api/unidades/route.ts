import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Catálogo de "Unidades" (nível mais baixo da hierarquia de Centro de
// Custo, Administração -> Empreendimento -> Unidade, pedido do Felipe,
// 05/08/2026) — alimenta o seletor de centro de custo em Lançamentos e o
// seletor "Unidade" na DRE/Orçamento. O número de Unidades ATIVAS é o
// denominador do rateio de custos de Administração/Empreendimento (ver
// lib/finance/centro-de-custo.ts).
//
// 06/08/2026 (pedido do Felipe): deixou de ser um cadastro próprio do
// Financeiro — "Unidade" agora É a UH real do Gateway (Configurações >
// Unidades), já usada por Governança, Manutenção, Avaliações e Recepção.
// Esta rota virou GET-only: criar/editar/excluir/desativar uma UH passou a
// ser feito só em Gateway > Configurações > Unidades (inclusive o mês de
// corte `desativadaEm`, usado no rateio retroativo).

// GET /api/unidades?empreendimentoId=xxx&todas=1
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const todas = searchParams.get("todas") === "1";
  const propertyId = searchParams.get("empreendimentoId"); // nome do query param mantido (compat com a UI atual)

  const uhs = await prisma.uH.findMany({
    where: {
      tenantId: session.tenantId,
      ...(todas ? {} : { ativo: true }),
      ...(propertyId ? { propertyId } : {}),
    },
    include: { property: { select: { nome: true } } },
    orderBy: [{ property: { nome: "asc" } }, { numero: "asc" }],
  });

  return NextResponse.json(
    uhs.map((u) => ({
      id: u.id,
      nome: u.numero,
      ativo: u.ativo,
      desativadaEm: u.desativadaEm,
      empreendimentoId: u.propertyId,
      empreendimento: u.property.nome,
    }))
  );
}
