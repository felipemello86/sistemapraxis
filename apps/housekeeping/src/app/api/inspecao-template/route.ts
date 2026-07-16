import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/inspecao-template/route.ts (v1).
// hotelId → tenantId.

const DEFAULT_TEMPLATE = [
  { categoria: "CAMA", item: "Lençol bem esticado, sem rugas", ordem: 1 },
  { categoria: "CAMA", item: "Lençol alinhado corretamente", ordem: 2 },
  { categoria: "CAMA", item: "Colcha/edredom bem posicionado", ordem: 3 },
  { categoria: "CAMA", item: "Toalhas limpas, dobradas e posicionadas", ordem: 4 },
  { categoria: "CAMA", item: "Travesseiros organizados e padronizados", ordem: 5 },
  { categoria: "BANHEIRO", item: "Vaso sanitário limpo", ordem: 6 },
  { categoria: "BANHEIRO", item: "Box/chuveiro higienizado e seco", ordem: 7 },
  { categoria: "BANHEIRO", item: "Papel higiênico disponível e bem colocado", ordem: 8 },
  { categoria: "BANHEIRO", item: "Lixo retirado e saco reposto", ordem: 9 },
  { categoria: "BANHEIRO", item: "Aroma agradável", ordem: 10 },
  { categoria: "BANHEIRO", item: "Pia limpa e sem manchas", ordem: 11 },
  { categoria: "QUARTO", item: "Lixo retirado e saco reposto", ordem: 12 },
  { categoria: "QUARTO", item: "Chão limpo (varrido e mopeado)", ordem: 13 },
  { categoria: "QUARTO", item: "Cadeiras e mesa alinhadas", ordem: 14 },
  { categoria: "QUARTO", item: "Controles remotos bem posicionados", ordem: 15 },
  { categoria: "QUARTO", item: "Controles remotos e maçanetas limpas", ordem: 16 },
  { categoria: "QUARTO", item: "Móveis e mesas limpas", ordem: 17 },
  { categoria: "QUARTO", item: "Aroma agradável", ordem: 18 },
  { categoria: "COZINHA", item: "Louça lavada", ordem: 19 },
  { categoria: "COZINHA", item: "Panelas completas e organizadas", ordem: 20 },
  { categoria: "COZINHA", item: "Talheres, xícaras, copos e pratos organizados", ordem: 21 },
  { categoria: "COZINHA", item: "Pano de prato e papel toalha disponíveis", ordem: 22 },
];

// GET - retorna template do tenant (cria default se não existir)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  let itens = await prisma.inspectionTemplate.findMany({
    where: { tenantId, ativo: true },
    orderBy: { ordem: "asc" },
  });

  // Cria template default se não existir
  if (itens.length === 0) {
    await prisma.inspectionTemplate.createMany({
      data: DEFAULT_TEMPLATE.map((t) => ({ ...t, tenantId })),
    });
    itens = await prisma.inspectionTemplate.findMany({
      where: { tenantId, ativo: true },
      orderBy: { ordem: "asc" },
    });
  }

  return NextResponse.json(itens);
}

// PUT - substitui o template completo
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const { itens } = await req.json();
  if (!Array.isArray(itens)) return NextResponse.json({ error: "itens obrigatório" }, { status: 400 });

  // Deleta existentes e recria
  await prisma.inspectionTemplate.deleteMany({ where: { tenantId } });
  await prisma.inspectionTemplate.createMany({
    data: itens.map((item: any, i: number) => ({
      tenantId,
      categoria: item.categoria,
      item: item.item,
      ordem: i + 1,
      ativo: true,
    })),
  });

  const result = await prisma.inspectionTemplate.findMany({
    where: { tenantId, ativo: true },
    orderBy: { ordem: "asc" },
  });
  return NextResponse.json(result);
}
