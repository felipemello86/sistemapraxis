import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { garantirEtapasPadrao } from "../../admin/crm/data";

export const runtime = "nodejs";

// Recebe os pedidos de demonstração da landing page pública
// (src/app/page.tsx). Rota deliberadamente SEM autenticação — é o único
// endpoint público de escrita da suíte, então os limites são explícitos
// aqui: campos obrigatórios validados, tamanho máximo por campo (evita
// alguém despejar texto gigante no banco) e nada é feito com o que chega
// além de gravar um DemoLead pra alguém do comercial ler depois no /admin.
const LIMITES = { nome: 120, hotel: 120, email: 160, telefone: 40, mensagem: 2000 };

function limpar(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const nome = limpar(body.nome, LIMITES.nome);
  const hotel = limpar(body.hotel, LIMITES.hotel);
  const email = limpar(body.email, LIMITES.email);
  const telefone = limpar(body.telefone, LIMITES.telefone);
  const mensagem = limpar(body.mensagem, LIMITES.mensagem);

  if (!nome || !hotel || !email || !telefone) {
    return NextResponse.json(
      { error: "Preencha nome, hotel, e-mail e telefone." },
      { status: 400 },
    );
  }
  // Validação de e-mail propositalmente frouxa (só formato básico) — recusar
  // um contato comercial de verdade por causa de regex é pior do que aceitar
  // um endereço estranho que o comercial descarta na hora de responder.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  // CRM (Fase 1): garante que existe pelo menos a 1ª etapa do funil e já
  // cria o lead direto nela — evita depender só do backfill de /admin/crm
  // (que só rodaria na próxima vez que alguém abrisse o board).
  await garantirEtapasPadrao();
  const primeiraEtapa = await prisma.pipelineStage.findFirst({ orderBy: { ordem: "asc" } });

  // fonte é sempre "Site" aqui — é o único ponto de entrada que representa
  // o formulário público da landing page (ver DemoLead.fonte no schema).
  await prisma.demoLead.create({
    data: { nome, hotel, email, telefone, mensagem: mensagem || null, fonte: "Site", stageId: primeiraEtapa?.id },
  });

  return NextResponse.json({ ok: true });
}
