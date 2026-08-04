// Cria o programa "Arrumação Simples" (tipo ARRUMACAO_SIMPLES) pra cada
// tenant que já usa "Arrumação Padrão" (tipo ARRUMACAO) — pedido do Felipe
// (04/08/2026): os programas de limpeza com referencial de tempo agora são
// de dois tipos:
//   - ARRUMACAO ("detalhada") — mantém o checklist passo a passo, pensado
//     pra treinar camareiras iniciantes. Não muda em nada com este script.
//   - ARRUMACAO_SIMPLES ("simples", default) — sem detalhamento de passo a
//     passo, só registra início e fim da limpeza na UH; pensado pra
//     camareiras experientes. Usa a mesma meta de tempo do tenant que a
//     detalhada (HkConfig.targetMinutes), mesma fórmula de score
//     (calcularScoreUH — 50% velocidade + 50% qualidade). É este script que
//     cria o programa em si (sem nenhuma etapa — de propósito, ver
//     CamareiraView: programa com 0 etapas vai direto pra manutenção →
//     fotos → finalizar).
//
// Não mexe em "Limpeza Específica" (LIMPEZA_COMPLETA) nem em "Super Limpeza
// ⭐️" (SUPER_LIMPEZA) — essas duas continuam existindo como estão hoje.
//
// Idempotente: pula tenants que já têm um programa ARRUMACAO_SIMPLES.
//
// Rodar (uma vez, em produção):
//   pnpm --filter @praxis/core exec tsx scripts/add-arrumacao-simples.ts

import { prisma } from "../src/prisma";

async function main() {
  const tenantsComArrumacao = await prisma.cleaningProgram.findMany({
    where: { tipo: "ARRUMACAO" },
    select: { tenantId: true, tenant: { select: { name: true } } },
    distinct: ["tenantId"],
  });

  if (tenantsComArrumacao.length === 0) {
    console.log("Nenhum tenant com programa ARRUMACAO encontrado — nada a fazer.");
    return;
  }

  for (const t of tenantsComArrumacao) {
    const jaExiste = await prisma.cleaningProgram.findFirst({
      where: { tenantId: t.tenantId, tipo: "ARRUMACAO_SIMPLES" },
    });
    if (jaExiste) {
      console.log(`[skip] ${t.tenant.name} já tem Arrumação Simples (${jaExiste.id})`);
      continue;
    }
    const criado = await prisma.cleaningProgram.create({
      data: {
        tenantId: t.tenantId,
        nome: "Arrumação Simples",
        tipo: "ARRUMACAO_SIMPLES",
        ativo: true,
      },
    });
    console.log(`[ok] ${t.tenant.name}: criado programa "Arrumação Simples" (${criado.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
