// Importação única da equipe real da BNB Flex pro tenant "bnbflex" na v2,
// puxando email/telegramChatId/whatsapp do banco suite_core do v0 (sistema
// em produção). Rodado uma vez manualmente, não faz parte de nenhum
// build/deploy:
//   npx tsx scripts/import-bnbflex-users.ts
//
// Cargos aqui são os definidos por Felipe pra v2 (podem diferir do cargo que
// a pessoa tinha no v0 — ex: Dayane Alves era MANUTENCAO no v0, vira
// LAVANDERIA aqui). Módulos de negócio não existem ainda nesta fundação,
// então ninguém recebe UserModuleAccess por enquanto — isso é atribuído
// depois, pela tela Configurações > Usuários, quando os módulos existirem.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";

const PESSOAS = [
  { nome: "Camila Castro", email: "camilaluanadecastro@gmail.com", role: "GERENTE", telegramChatId: "6071459732", whatsapp: "5583988408723" },
  { nome: "Thayse Albuquerque", email: "thaysemalbq@gmail.com", role: "ATENDIMENTO", telegramChatId: "8686684669", whatsapp: "5583996393698" },
  { nome: "Jenifer Camila", email: "jenifercamila79@gmail.com", role: "ATENDIMENTO", telegramChatId: "6732564714", whatsapp: "5581983034568" },
  { nome: "Milena Maria", email: "mylenamariaa1999@gmail.com", role: "GOVERNANTA", telegramChatId: "8983577745", whatsapp: "5581981104829" },
  { nome: "Jurandir Roberto", email: "juramassa63@gmail.com", role: "MANUTENCAO", telegramChatId: "7989640656", whatsapp: "5581983046838" },
  { nome: "Dayane Alves", email: "alvesdayane.santana@gmail.com", role: "LAVANDERIA", telegramChatId: "8230792227", whatsapp: "5581998920461" },
  { nome: "Iasmyn Emilly", email: "iasmimemillyguedesdeazevedoemi@gmail.com", role: "CAMAREIRA", telegramChatId: "8842529466", whatsapp: "5581992463600" },
  { nome: "Kassia Guedes", email: "kassiaguedes5@gmail.com", role: "CAMAREIRA", telegramChatId: "8347893780", whatsapp: null },
  { nome: "Leandra Vitória", email: "vleandra049@gmail.com", role: "CAMAREIRA", telegramChatId: "8001026684", whatsapp: "5581991192190" },
  { nome: "Carol Meireles", email: "meireleskarol15@gmail.com", role: "CAMAREIRA", telegramChatId: "1849175701", whatsapp: "5581983628892" },
] as const;

function senhaTemporaria(): string {
  return crypto.randomBytes(6).toString("base64url"); // ~8 chars, url-safe
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    throw new Error(`Tenant "${TENANT_SLUG}" não encontrado — rode o seed antes.`);
  }

  const resultados: { nome: string; email: string; senha: string }[] = [];

  for (const pessoa of PESSOAS) {
    const senha = senhaTemporaria();
    const passwordHash = await bcrypt.hash(senha, 10);

    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: pessoa.email } },
      update: {
        nome: pessoa.nome,
        role: pessoa.role,
        telegramChatId: pessoa.telegramChatId,
        whatsapp: pessoa.whatsapp,
      },
      create: {
        tenantId: tenant.id,
        nome: pessoa.nome,
        email: pessoa.email,
        role: pessoa.role,
        telegramChatId: pessoa.telegramChatId,
        whatsapp: pessoa.whatsapp,
        passwordHash,
      },
    });

    resultados.push({ nome: pessoa.nome, email: pessoa.email, senha });
  }

  console.log("\nUsuários importados para bnbflex:\n");
  for (const r of resultados) {
    console.log(`${r.nome.padEnd(20)} ${r.email.padEnd(42)} senha temporária: ${r.senha}`);
  }
  console.log("\nPeça pra cada um trocar a senha no primeiro login (Configurações > Trocar senha).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
