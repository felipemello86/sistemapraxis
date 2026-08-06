import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Catálogo de "Empreendimentos" (nível intermediário da hierarquia de
// Centro de Custo, Administração -> Empreendimento -> Unidade, pedido do
// Felipe, 05/08/2026) — alimenta o seletor de centro de custo em
// Lançamentos e o seletor "Empreendimento" na DRE/Orçamento.
//
// 06/08/2026 (pedido do Felipe): deixou de ser um cadastro próprio do
// Financeiro — "Empreendimento" agora É a Property real do Gateway
// (Configurações > Unidades), já usada por Governança, Manutenção,
// Avaliações e Recepção. Esta rota virou GET-only: criar/editar/excluir uma
// Property passou a ser feito só em Gateway > Configurações > Unidades.

// GET /api/empreendimentos?todas=1 (opcional: inclui inativas)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const todas = searchParams.get("todas") === "1";

  const properties = await prisma.property.findMany({
    where: { tenantId: session.tenantId, ...(todas ? {} : { ativo: true }) },
    include: { uhs: { select: { id: true, ativo: true } } },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(
    properties.map((p) => ({
      id: p.id,
      nome: p.nome,
      ativo: p.ativo,
      totalUnidades: p.uhs.length,
      totalUnidadesAtivas: p.uhs.filter((u) => u.ativo).length,
    }))
  );
}
