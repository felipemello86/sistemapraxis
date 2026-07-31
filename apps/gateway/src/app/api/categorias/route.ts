import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession } from "@praxis/core";
import { bloqueadoParaGerenciarCadastros } from "@/lib/auth-guard";

// Categoria de UH (UH.tipo, ex: "Standard", "Loft com Vista Frontal") não é
// um cadastro à parte no schema — é só um texto livre no próprio UH,
// agrupado por Property na tela de Configurações → UHs e no Calendário do
// módulo Recepção (ver comentário em UHsClient.tsx). "Editar categoria" na
// prática é um rename em lote: troca o tipo de toda UH daquela property que
// tinha o nome antigo pro nome novo — se o nome novo já existe como outra
// categoria da mesma property, as duas se fundem numa só (comportamento
// esperado, não um bug).

export async function PUT(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarCadastros(session);
  if (bloqueado) return bloqueado;

  const { propertyId, tipoAtual, tipoNovo } = await req.json();
  if (!propertyId || !tipoAtual) {
    return NextResponse.json({ error: "propertyId e tipoAtual obrigatórios" }, { status: 400 });
  }
  const trimmed = (tipoNovo ?? "").trim();
  if (!trimmed) return NextResponse.json({ error: "Nome da categoria obrigatório" }, { status: 400 });

  const resultado = await prisma.uH.updateMany({
    where: { tenantId: session!.tenantId, propertyId, tipo: tipoAtual },
    data: { tipo: trimmed },
  });

  return NextResponse.json({ ok: true, atualizados: resultado.count });
}
