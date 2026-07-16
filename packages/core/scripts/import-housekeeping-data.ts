// Importação única dos dados REAIS de Governança da BNB Flex, direto do
// banco do v0 (apps/housekeeping, schema local desse app — não é o
// suite_core) pro tenant "bnbflex" na v2:
//   - UHs (36 reais, com status/manutenção/ativo tal como estão hoje)
//   - Programas de limpeza + suas etapas (Arrumação Padrão, Limpeza Específica)
//   - Configuração do hotel (horário de notificação, meta de tempo, fotos obrigatórias)
//   - Checklist de inspeção (22 itens, por categoria)
//
// Não importa DailyAssignment/CleaningSession/InspectionSession — isso é
// dado operacional do dia a dia (muda toda hora), não faz sentido "puxar"
// como snapshot. Rodar:
//   npx tsx scripts/import-housekeeping-data.ts

import pg from "pg";
import { prisma } from "../src/prisma";

const V0_HOUSEKEEPING_DATABASE_URL =
  "postgresql://neondb_owner:npg_uLCY2Gdhc4Rp@ep-purple-river-acug1dgp-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const TENANT_SLUG = "bnbflex";
const V0_HOTEL_SLUG = "demo"; // nome do Hotel no v0 é "Bnb Flex", mas o slug ficou "demo"

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  // Habilita o módulo pro tenant — sem isso, ninguém passa no guard de
  // acesso (hasModuleAccess) mesmo com UH/programas já importados.
  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: tenant.id, module: "HOUSEKEEPING" } },
    update: { enabled: true },
    create: { tenantId: tenant.id, module: "HOUSEKEEPING", enabled: true },
  });

  const v0 = new pg.Client({ connectionString: V0_HOUSEKEEPING_DATABASE_URL });
  await v0.connect();

  const hotelRes = await v0.query<{ id: string }>(
    `SELECT id FROM "Hotel" WHERE slug = $1 LIMIT 1;`,
    [V0_HOTEL_SLUG]
  );
  const hotel = hotelRes.rows[0];
  if (!hotel) throw new Error(`Hotel "${V0_HOTEL_SLUG}" não encontrado no v0.`);
  const hotelId = hotel.id;

  // ── Configuração do hotel ──────────────────────────────────────────────
  const configRes = await v0.query<{
    notificationTime: string;
    targetMinutes: number;
    photoRequirements: string;
  }>(`SELECT "notificationTime", "targetMinutes", "photoRequirements" FROM "HotelConfig" WHERE "hotelId" = $1;`, [hotelId]);
  if (configRes.rows[0]) {
    const c = configRes.rows[0];
    await prisma.hkConfig.upsert({
      where: { tenantId: tenant.id },
      update: { notificationTime: c.notificationTime, targetMinutes: c.targetMinutes, photoRequirements: c.photoRequirements },
      create: {
        tenantId: tenant.id,
        notificationTime: c.notificationTime,
        targetMinutes: c.targetMinutes,
        photoRequirements: c.photoRequirements,
      },
    });
  }

  // ── UHs ─────────────────────────────────────────────────────────────────
  const uhsRes = await v0.query<{
    numero: string; tipo: string; status: string; ativo: boolean; ordem: number;
    emManutencao: boolean; manutencaoDescricao: string | null;
  }>(`SELECT numero, tipo, status, ativo, ordem, "emManutencao", "manutencaoDescricao" FROM "UH" WHERE "hotelId" = $1 ORDER BY ordem, numero;`, [hotelId]);

  for (const u of uhsRes.rows) {
    await prisma.uH.upsert({
      where: { tenantId_numero: { tenantId: tenant.id, numero: u.numero } },
      update: {
        tipo: u.tipo, status: u.status, ativo: u.ativo, ordem: u.ordem,
        emManutencao: u.emManutencao, manutencaoDescricao: u.manutencaoDescricao,
      },
      create: {
        tenantId: tenant.id, numero: u.numero, tipo: u.tipo, status: u.status,
        ativo: u.ativo, ordem: u.ordem, emManutencao: u.emManutencao,
        manutencaoDescricao: u.manutencaoDescricao,
      },
    });
  }

  // ── Programas de limpeza + etapas ─────────────────────────────────────
  const programsRes = await v0.query<{ id: string; nome: string; tipo: string; ativo: boolean }>(
    `SELECT id, nome, tipo, ativo FROM "CleaningProgram" WHERE "hotelId" = $1;`,
    [hotelId]
  );

  for (const p of programsRes.rows) {
    const programa = await prisma.cleaningProgram.upsert({
      where: { id: p.id },
      update: { nome: p.nome, tipo: p.tipo, ativo: p.ativo },
      create: { id: p.id, tenantId: tenant.id, nome: p.nome, tipo: p.tipo, ativo: p.ativo },
    });

    const stepsRes = await v0.query<{ id: string; ordem: number; titulo: string; descricao: string | null }>(
      `SELECT id, ordem, titulo, descricao FROM "ProgramStep" WHERE "programId" = $1 ORDER BY ordem;`,
      [p.id]
    );
    for (const s of stepsRes.rows) {
      await prisma.programStep.upsert({
        where: { id: s.id },
        update: { ordem: s.ordem, titulo: s.titulo, descricao: s.descricao },
        create: { id: s.id, programId: programa.id, ordem: s.ordem, titulo: s.titulo, descricao: s.descricao },
      });
    }
    console.log(`Programa "${p.nome}": ${stepsRes.rows.length} etapas.`);
  }

  // ── Checklist de inspeção ──────────────────────────────────────────────
  const templatesRes = await v0.query<{ categoria: string; item: string; ordem: number; ativo: boolean }>(
    `SELECT categoria, item, ordem, ativo FROM "InspectionTemplate" WHERE "hotelId" = $1 ORDER BY categoria, ordem;`,
    [hotelId]
  );
  // InspectionTemplate não tem constraint única natural no v1 além do id —
  // como este script pode rodar mais de uma vez, evita duplicar limpando
  // e recriando os templates deste tenant a cada execução.
  await prisma.inspectionTemplate.deleteMany({ where: { tenantId: tenant.id } });
  for (const t of templatesRes.rows) {
    await prisma.inspectionTemplate.create({
      data: { tenantId: tenant.id, categoria: t.categoria, item: t.item, ordem: t.ordem, ativo: t.ativo },
    });
  }

  await v0.end();

  console.log(`\nImportado: ${uhsRes.rows.length} UHs, ${programsRes.rows.length} programas, ${templatesRes.rows.length} itens de inspeção.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
