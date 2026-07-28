// Seed dos DEMAIS módulos pro hotel-teste "avel" (Housekeeping já seedado por
// seed-avel-test.ts) — pedido explícito do Felipe: dados de Manutenção,
// Estoque, Restaurante e Avaliações cobrindo os mesmos 6 meses de história,
// evoluindo ao longo do tempo (mesmo espírito do seed principal).
//
// Rodar em fases (mesmo motivo do seed principal: sandbox mata qualquer
// processo que passe de ~45s, sem exceção pra nohup/disown):
//   SEED_PHASE=setup             — 1 chamada só, cria catálogos/config/usuários
//   SEED_PHASE=maintenance       — fatiado por SEED_IDX_START/SEED_IDX_END
//   SEED_PHASE=stock_restaurant  — fatiado por SEED_DAY_START/SEED_DAY_END
//   SEED_PHASE=reviews           — fatiado por SEED_DAY_START/SEED_DAY_END
//
// Idempotência: setup usa upsert em tudo. As fases históricas (maintenance/
// stock_restaurant/reviews) inserem de novo se rodadas 2x pro mesmo range —
// não rodar a mesma fatia duas vezes.

import { prisma } from "../src/prisma";

const SLUG = process.env.SEED_SLUG ?? "avel";
const PHASE = process.env.SEED_PHASE ?? "setup";
const DIAS = 183;
const IDX_START = process.env.SEED_IDX_START ? parseInt(process.env.SEED_IDX_START, 10) : 0;
const IDX_END_ENV = process.env.SEED_IDX_END ? parseInt(process.env.SEED_IDX_END, 10) : undefined;
const DAY_START = process.env.SEED_DAY_START ? parseInt(process.env.SEED_DAY_START, 10) : 0;
const DAY_END = process.env.SEED_DAY_END ? parseInt(process.env.SEED_DAY_END, 10) : DIAS - 1;
const ORCAMENTO_MS = 32000;

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}
function atHour(d: Date, h: number, m: number) {
  const r = new Date(d);
  r.setUTCHours(h, m, 0, 0);
  return r;
}
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number) {
  return Math.round(rand(min, max));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DESCRICOES_FALHA_MANUTENCAO = [
  "Item apresentando desgaste visível, necessita reparo.",
  "Funcionamento irregular identificado durante a inspeção.",
  "Sinais de mau uso / dano acidental.",
  "Fixação comprometida, risco de piora se não tratado.",
  "Item fora do padrão esperado — necessita substituição.",
  "Manchas persistentes que não saem com limpeza comum.",
];

const DESCRICOES_EXECUCAO = [
  "Reparo realizado, item testado e aprovado.",
  "Peça substituída, funcionamento normalizado.",
  "Ajuste de fixação realizado.",
  "Pintura/acabamento retocado.",
  "Serviço externo concluído conforme orçado.",
];

const NOMES_HOSPEDES = [
  "Marina Alves", "Carlos Eduardo Souza", "Fernanda Lima", "Ricardo Barros",
  "Juliana Costa", "André Ferreira", "Patrícia Nogueira", "Bruno Martins",
  "Camila Rocha", "Diego Pereira", "Larissa Mendes", "Thiago Ramos",
  "Vanessa Cardoso", "Rodrigo Teixeira", "Beatriz Fonseca",
];

const COMENTARIOS_POSITIVOS = [
  "Quarto impecável, equipe super atenciosa. Voltarei com certeza!",
  "Café da manhã excelente, variado e sempre fresquinho.",
  "Localização ótima, check-in rápido e tudo muito limpo.",
  "Melhor experiência de hospedagem que tive esse ano, recomendo muito.",
  "Cama muito confortável e quarto silencioso, dormi super bem.",
];
const COMENTARIOS_NEUTROS = [
  "Estadia ok, nada excepcional mas cumpriu o esperado.",
  "Bom custo-benefício, alguns detalhes poderiam melhorar.",
  "Quarto simples mas funcional, atendimento razoável.",
];
const COMENTARIOS_NEGATIVOS = [
  "Quarto estava com cheiro de mofo, esperava mais pelo preço.",
  "Banheiro com problemas de manutenção, chuveiro fraco.",
  "Café da manhã com poucas opções e acabou cedo.",
  "Barulho da rua incomodou bastante durante a noite.",
  "Toalhas manchadas e cama com lençol amassado na chegada.",
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) throw new Error(`[avel-mod] tenant "${SLUG}" não encontrado — rode o seed principal (seed-avel-test.ts) primeiro.`);
  const tenantId = tenant.id;

  if (PHASE === "setup") return runSetup(tenantId);
  if (PHASE === "maintenance") return runMaintenance(tenantId);
  if (PHASE === "stock_restaurant") return runStockRestaurant(tenantId);
  if (PHASE === "reviews") return runReviews(tenantId);
  throw new Error(`SEED_PHASE inválido: ${PHASE}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP — catálogos, config, usuários, módulos habilitados. Sem loop de dias,
// roda numa chamada só.
// ═══════════════════════════════════════════════════════════════════════════
async function runSetup(tenantId: string) {
  console.log("[avel-mod] habilitando módulos...");
  for (const module of ["MAINTENANCE", "BOOKING_REVIEWS", "RESTAURANT", "STOCK"] as const) {
    await prisma.tenantModule.upsert({
      where: { tenantId_module: { tenantId, module } },
      update: { enabled: true },
      create: { tenantId, module, enabled: true },
    });
  }

  console.log("[avel-mod] criando usuário de Manutenção...");
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash("avel123", 10);
  const manutencaoUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "manutencao@avel.com" } },
    update: {},
    create: { tenantId, nome: "Paulo Manutenção", email: "manutencao@avel.com", passwordHash, role: "MANUTENCAO" },
  });

  const felipe = await prisma.user.findFirst({ where: { tenantId, email: "felipe_mello86@hotmail.com" } });
  const gerente = await prisma.user.findFirst({ where: { tenantId, email: "gerente@avel.com" } });
  const atendimento = await prisma.user.findFirst({ where: { tenantId, email: "atendimento@avel.com" } });
  const governanta = await prisma.user.findFirst({ where: { tenantId, email: "governanta@avel.com" } });

  console.log("[avel-mod] concedendo acesso aos módulos...");
  const grants: { userId: string; module: "MAINTENANCE" | "BOOKING_REVIEWS" | "RESTAURANT" | "STOCK" }[] = [];
  for (const m of ["MAINTENANCE", "BOOKING_REVIEWS", "RESTAURANT", "STOCK"] as const) {
    if (felipe) grants.push({ userId: felipe.id, module: m });
    if (gerente) grants.push({ userId: gerente.id, module: m });
  }
  if (atendimento) {
    grants.push({ userId: atendimento.id, module: "BOOKING_REVIEWS" });
    grants.push({ userId: atendimento.id, module: "RESTAURANT" });
    grants.push({ userId: atendimento.id, module: "STOCK" });
  }
  if (governanta) grants.push({ userId: governanta.id, module: "STOCK" });
  grants.push({ userId: manutencaoUser.id, module: "MAINTENANCE" });

  for (const g of grants) {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: g.userId, module: g.module } },
      update: { enabled: true },
      create: { userId: g.userId, module: g.module, enabled: true },
    });
  }

  if (atendimento && !atendimento.cozinha) {
    await prisma.user.update({ where: { id: atendimento.id }, data: { cozinha: true } });
  }

  console.log("[avel-mod] config de Manutenção e Avaliações...");
  await prisma.maintenanceConfig.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId, maxDaysBetweenInspections: 90, goal: 90 },
  });
  await prisma.reviewsConfig.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId, targetScore: 4.8 },
  });

  console.log("[avel-mod] catálogo de itens de Manutenção...");
  const jaTemChecklist = await prisma.maintenanceChecklistItem.count({ where: { tenantId } });
  if (jaTemChecklist === 0) {
    const { DEFAULT_MAINTENANCE_ITEMS } = require("../src/maintenance-defaults");
    await prisma.maintenanceChecklistItem.createMany({
      data: DEFAULT_MAINTENANCE_ITEMS.map((it: any) => ({
        tenantId, name: it.name, category: it.category, subDescription: it.subDescription,
      })),
    });
  }
  const checklist = await prisma.maintenanceChecklistItem.findMany({ where: { tenantId } });
  const porNome = (nome: string) => checklist.find((c) => c.name === nome);

  console.log("[avel-mod] fornecedores de Manutenção...");
  const fornecedoresDef = [
    { nome: "Elétrica Silva", contato: "(11) 98888-1010", itens: ["Tomadas e interruptores", "Iluminação", "Fechadura eletrônica"] },
    { nome: "Hidráulica Rocha", contato: "(11) 98888-2020", itens: ["Pia da cozinha", "Pia do banheiro", "Chuveiro", "Vaso sanitário", "Ducha higiênica"] },
    { nome: "Marcenaria Bom Lar", contato: "(11) 98888-3030", itens: ["Armários da cozinha", "Armário (guarda-roupa)", "Armário do banheiro", "Cabeceira da cama", "Mesa", "Cadeiras"] },
    { nome: "Vidraçaria Cristal", contato: "(11) 98888-4040", itens: ["Box", "Espelho", "Janela grande", "Janela do banheiro"] },
  ];
  for (const f of fornecedoresDef) {
    const existente = await prisma.maintenanceSupplier.findFirst({ where: { tenantId, nome: f.nome } });
    const supplier = existente ?? (await prisma.maintenanceSupplier.create({ data: { tenantId, nome: f.nome, contato: f.contato } }));
    for (const nomeItem of f.itens) {
      const ci = porNome(nomeItem);
      if (!ci) continue;
      await prisma.maintenanceSupplierChecklistItem.upsert({
        where: { supplierId_checklistItemId: { supplierId: supplier.id, checklistItemId: ci.id } },
        update: {},
        create: { supplierId: supplier.id, checklistItemId: ci.id },
      });
    }
  }

  console.log("[avel-mod] categorias de Avaliações...");
  const categoriasDef = ["Limpeza", "Manutenção", "Atendimento", "Check-in/Check-out", "Enxoval", "Café da manhã", "Estrutura/Conforto", "Localização/Barulho"];
  for (const nome of categoriasDef) {
    await prisma.category.upsert({
      where: { tenantId_name: { tenantId, name: nome } },
      update: {},
      create: { tenantId, name: nome },
    });
  }

  console.log("[avel-mod] catálogo de produtos de Estoque...");
  const produtosDef = [
    { nome: "Pão francês", categoria: "CAFÉ DA MANHÃ", unidade: "kg", estoqueMinimo: 5, custo: 8 },
    { nome: "Presunto", categoria: "CAFÉ DA MANHÃ", unidade: "kg", estoqueMinimo: 2, custo: 28 },
    { nome: "Queijo", categoria: "CAFÉ DA MANHÃ", unidade: "kg", estoqueMinimo: 2, custo: 32 },
    { nome: "Manteiga", categoria: "CAFÉ DA MANHÃ", unidade: "kg", estoqueMinimo: 1, custo: 22 },
    { nome: "Geleia", categoria: "CAFÉ DA MANHÃ", unidade: "un", estoqueMinimo: 5, custo: 9 },
    { nome: "Suco de laranja", categoria: "CAFÉ DA MANHÃ", unidade: "L", estoqueMinimo: 10, custo: 6 },
    { nome: "Café em pó", categoria: "CAFÉ DA MANHÃ", unidade: "kg", estoqueMinimo: 3, custo: 18 },
    { nome: "Leite", categoria: "CAFÉ DA MANHÃ", unidade: "L", estoqueMinimo: 15, custo: 5 },
    { nome: "Frutas variadas", categoria: "CAFÉ DA MANHÃ", unidade: "kg", estoqueMinimo: 8, custo: 7 },
    { nome: "Iogurte", categoria: "CAFÉ DA MANHÃ", unidade: "un", estoqueMinimo: 20, custo: 3 },
    { nome: "Cereal", categoria: "CAFÉ DA MANHÃ", unidade: "kg", estoqueMinimo: 3, custo: 14 },
    { nome: "Bolo caseiro", categoria: "CAFÉ DA MANHÃ", unidade: "un", estoqueMinimo: 10, custo: 4 },
    { nome: "Detergente", categoria: "LIMPEZA", unidade: "L", estoqueMinimo: 5, custo: 6 },
    { nome: "Álcool 70%", categoria: "LIMPEZA", unidade: "L", estoqueMinimo: 10, custo: 9 },
    { nome: "Papel toalha", categoria: "LIMPEZA", unidade: "un", estoqueMinimo: 20, custo: 4 },
    { nome: "Sabão em pó", categoria: "LAVANDERIA", unidade: "kg", estoqueMinimo: 5, custo: 12 },
    { nome: "Amaciante", categoria: "LAVANDERIA", unidade: "L", estoqueMinimo: 5, custo: 15 },
    { nome: "Shampoo", categoria: "AMENITIES", unidade: "un", estoqueMinimo: 30, custo: 3 },
    { nome: "Sabonete", categoria: "AMENITIES", unidade: "un", estoqueMinimo: 30, custo: 2 },
    { nome: "Condicionador", categoria: "AMENITIES", unidade: "un", estoqueMinimo: 30, custo: 3 },
    { nome: "Luvas descartáveis", categoria: "EPI", unidade: "cx", estoqueMinimo: 5, custo: 20 },
    { nome: "Máscaras", categoria: "EPI", unidade: "cx", estoqueMinimo: 5, custo: 18 },
  ];
  for (const p of produtosDef) {
    const existente = await prisma.stockProduct.findFirst({ where: { tenantId, nome: p.nome } });
    if (!existente) {
      await prisma.stockProduct.create({
        data: { tenantId, nome: p.nome, categoria: p.categoria, unidade: p.unidade, estoqueMinimo: p.estoqueMinimo, custo: p.custo, quantidade: p.estoqueMinimo * 2 },
      });
    }
  }
  const produtos = await prisma.stockProduct.findMany({ where: { tenantId } });
  const produtoPorNome = (nome: string) => produtos.find((p) => p.nome === nome)!;

  console.log("[avel-mod] cardápio do Restaurante...");
  const secoesDef = [
    { nome: "Pães e Frios", ordem: 1, itens: [
      { nome: "Pão na chapa", stockProduto: "Pão francês", qtd: 0.15 },
      { nome: "Presunto", stockProduto: "Presunto", qtd: 0.05 },
      { nome: "Queijo", stockProduto: "Queijo", qtd: 0.05 },
      { nome: "Manteiga", stockProduto: "Manteiga", qtd: 0.02 },
    ]},
    { nome: "Bebidas", ordem: 2, itens: [
      { nome: "Suco de laranja", stockProduto: "Suco de laranja", qtd: 0.2 },
      { nome: "Café", stockProduto: "Café em pó", qtd: 0.02 },
      { nome: "Leite", stockProduto: "Leite", qtd: 0.2 },
    ]},
    { nome: "Doces e Frutas", ordem: 3, itens: [
      { nome: "Geleia", stockProduto: "Geleia", qtd: 0.1 },
      { nome: "Frutas da estação", stockProduto: "Frutas variadas", qtd: 0.15 },
      { nome: "Bolo caseiro", stockProduto: "Bolo caseiro", qtd: 1 },
      { nome: "Iogurte", stockProduto: "Iogurte", qtd: 1 },
    ]},
    { nome: "Cereais", ordem: 4, itens: [
      { nome: "Cereal", stockProduto: "Cereal", qtd: 0.05 },
    ]},
  ];
  for (const s of secoesDef) {
    let secao = await prisma.menuSection.findFirst({ where: { tenantId, nome: s.nome } });
    if (!secao) {
      secao = await prisma.menuSection.create({ data: { tenantId, nome: s.nome, ordem: s.ordem, limiteSingle: 2 } });
    }
    for (const it of s.itens) {
      const existente = await prisma.menuItem.findFirst({ where: { tenantId, nome: it.nome } });
      if (!existente) {
        await prisma.menuItem.create({
          data: { tenantId, sectionId: secao.id, nome: it.nome, ordem: 0, stockProductId: produtoPorNome(it.stockProduto).id, quantidadePorPorcao: it.qtd },
        });
      }
    }
  }

  console.log("[avel-mod] setup concluído.");
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUTENÇÃO — inspeções periódicas por UH (não diárias, ~28-42 dias entre
// inspeções por UH, igual ao maxDaysBetweenInspections configurado),
// gerando não-conformidades que evoluem pelo fluxo de Correção (Aquisição /
// Serviços Externos / Execução) até serem resolvidas (ou ficarem em aberto,
// pros kanbans não ficarem vazios).
// ═══════════════════════════════════════════════════════════════════════════
async function runMaintenance(tenantId: string) {
  const inicioExecucao = Date.now();
  const hoje = atHour(new Date(), 12, 0);
  const inicioPeriodo = addDays(hoje, -(DIAS - 1));

  const uhs = await prisma.uH.findMany({ where: { tenantId }, orderBy: { numero: "asc" } });
  const checklist = await prisma.maintenanceChecklistItem.findMany({ where: { tenantId } });
  const suppliers = await prisma.maintenanceSupplier.findMany({ where: { tenantId } });
  const manutencaoUser = await prisma.user.findFirst({ where: { tenantId, email: "manutencao@avel.com" } });
  const manutencaoUserId = manutencaoUser?.id;

  // Precomputa a agenda de inspeções — determinístico por UH (mesma
  // seed lógica sempre gera os mesmos dias, então rodar em fatias
  // sequenciais é seguro e sempre produz a mesma lista de eventos).
  const eventos: { uhId: string; dia: number }[] = [];
  for (const uh of uhs) {
    const seed = uh.numero.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const intervalo = 28 + (seed % 15); // 28..42
    const offset = seed % intervalo;
    for (let dia = offset; dia < DIAS; dia += intervalo) {
      eventos.push({ uhId: uh.id, dia });
    }
  }
  eventos.sort((a, b) => a.dia - b.dia || a.uhId.localeCompare(b.uhId));

  const idxEnd = IDX_END_ENV ?? eventos.length - 1;
  console.log(`[avel-mod] manutenção: ${eventos.length} inspeções previstas no total, processando índices ${IDX_START}..${idxEnd}`);

  const CONCORRENCIA = 4;
  let idx = IDX_START;
  while (idx <= idxEnd) {
    const lote = eventos.slice(idx, Math.min(idx + CONCORRENCIA, idxEnd + 1));
    await Promise.all(
      lote.map((ev) =>
        processarInspecaoManutencao({
          tenantId, uhId: ev.uhId, dia: ev.dia, inicioPeriodo, checklist, suppliers, manutencaoUserId,
        })
      )
    );
    idx += lote.length;
    console.log(`[avel-mod] manutenção: processados ${idx}/${eventos.length}`);

    if (Date.now() - inicioExecucao > ORCAMENTO_MS && idx <= idxEnd) {
      console.log(`[avel-mod] orçamento de tempo atingido — parou no índice ${idx - 1}. Continue com SEED_IDX_START=${idx}.`);
      return;
    }
  }
  console.log(`[avel-mod] manutenção: TODAS AS INSPEÇÕES PROCESSADAS.`);
}

async function processarInspecaoManutencao(params: {
  tenantId: string; uhId: string; dia: number; inicioPeriodo: Date;
  checklist: { id: string; name: string }[]; suppliers: { id: string }[]; manutencaoUserId: string | undefined;
}) {
  const { tenantId, uhId, dia, inicioPeriodo, checklist, suppliers, manutencaoUserId } = params;
  const data = addDays(inicioPeriodo, dia);
  const t = dia / (DIAS - 1);
  const taxaFalha = 0.24 - 0.16 * t; // hotel melhorando: 24% -> 8%
  const nItens = randInt(15, 28);
  const itensAvaliados = shuffle(checklist).slice(0, nItens);

  const itemsCreateData = itensAvaliados.map((ci) => {
    const nc = Math.random() < taxaFalha;
    return {
      checklistItemId: ci.id,
      status: nc ? "NAO_CONFORME" : "CONFORME",
      comment: nc ? pick(DESCRICOES_FALHA_MANUTENCAO) : null,
      photos: "[]",
      urgente: nc && Math.random() < 0.08,
    };
  });

  const inspection = await prisma.maintenanceInspection.create({
    data: {
      tenantId, uhId,
      inspectorId: manutencaoUserId,
      date: atHour(data, randInt(9, 16), pick([0, 15, 30, 45])),
      items: { create: itemsCreateData },
    },
    include: { items: true },
  });

  for (const item of inspection.items) {
    if (item.status !== "NAO_CONFORME") continue;

    const needsMaterial = Math.random() < 0.35;
    const needsExternalService = Math.random() < 0.3;
    const resolverEm = dia + randInt(2, 25);
    const podeResolver = resolverEm <= DIAS - 1 - 3;
    const resolved = podeResolver && Math.random() < 0.8;
    const supplier = needsExternalService && suppliers.length ? pick(suppliers) : null;

    const cardData: any = {
      tenantId, uhId,
      inspectionItemId: item.id,
      checklistItemId: item.checklistItemId,
      needsMaterial, needsExternalService,
      triagedAt: data, triagedById: manutencaoUserId,
    };

    let dataResolucao: Date | null = null;
    if (resolved) {
      dataResolucao = addDays(inicioPeriodo, resolverEm);
      cardData.materialStatus = needsMaterial ? "COMPRADO" : "A_ADQUIRIR";
      if (needsMaterial) {
        cardData.materialCompradoEm = dataResolucao;
        cardData.materialCompradoPorId = manutencaoUserId;
      }
      cardData.externalServiceStatus = needsExternalService ? "EXECUTADO" : "A_CONTRATAR";
      if (needsExternalService) {
        cardData.hiredSupplierId = supplier?.id;
        cardData.scheduledDate = addDays(dataResolucao, -randInt(1, 5));
        cardData.scheduledById = manutencaoUserId;
      }
      cardData.executionStatus = "EXECUTADA";
      cardData.executedDescription = pick(DESCRICOES_EXECUCAO);
      cardData.executedPhotos = "[]";
      cardData.executedAt = dataResolucao;
      cardData.executedById = manutencaoUserId;
    } else {
      if (needsMaterial && Math.random() < 0.4) {
        cardData.materialStatus = "COMPRADO";
        cardData.materialCompradoEm = data;
        cardData.materialCompradoPorId = manutencaoUserId;
      }
      if (needsExternalService) {
        cardData.externalServiceStatus = pick(["A_CONTRATAR", "EM_NEGOCIACAO", "AGENDADO"]);
        if (cardData.externalServiceStatus !== "A_CONTRATAR") cardData.hiredSupplierId = supplier?.id;
        if (cardData.externalServiceStatus === "AGENDADO") {
          cardData.scheduledDate = addDays(data, randInt(3, 15));
          cardData.scheduledById = manutencaoUserId;
        }
      }
      cardData.executionStatus = !needsMaterial && !needsExternalService ? pick(["A_FAZER", "PLANEJADA"]) : "A_FAZER";
    }

    const card = await prisma.maintenanceCorrectionCard.create({ data: cardData });

    if (resolved && dataResolucao) {
      await prisma.maintenanceInspectionItem.update({
        where: { id: item.id },
        data: { status: "CONFORME", corrigidoEm: dataResolucao, comment: null, photos: "[]", urgente: false },
      });
      await prisma.maintenanceCorrection.create({
        data: {
          tenantId, inspectionItemId: item.id, uhId, checklistItemId: item.checklistItemId,
          authorId: manutencaoUserId, description: pick(DESCRICOES_EXECUCAO), photos: "[]", createdAt: dataResolucao,
        },
      });

      if (Math.random() < 0.6) {
        const dataStr = toDateStr(dataResolucao);
        const commitment = await prisma.maintenanceDailyCommitment.upsert({
          where: { tenantId_data: { tenantId, data: dataStr } },
          update: { totalPrevisto: { increment: 1 } },
          create: {
            tenantId, data: dataStr, closedById: manutencaoUserId,
            conformidadeAntes: randInt(70, 90), conformidadeDepois: randInt(80, 97),
            totalPrevisto: 1,
          },
        });
        await prisma.maintenanceCorrectionCard.update({ where: { id: card.id }, data: { dailyCommitmentId: commitment.id } });
      }
    }

    if (needsExternalService && supplier && (cardData.externalServiceStatus === "AGENDADO" || cardData.externalServiceStatus === "EXECUTADO")) {
      await prisma.maintenanceCorrectionSupplierQuote.create({
        data: { tenantId, cardId: card.id, supplierId: supplier.id, createdById: manutencaoUserId },
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTOQUE + RESTAURANTE — pedidos de café da manhã (com baixa de estoque nos
// finalizados) + reposições semanais de estoque. Loop diário igual ao seed
// principal, mesmo mecanismo de orçamento de tempo.
// ═══════════════════════════════════════════════════════════════════════════
async function runStockRestaurant(tenantId: string) {
  const inicioExecucao = Date.now();
  const hoje = atHour(new Date(), 12, 0);
  const inicioPeriodo = addDays(hoje, -(DIAS - 1));

  const menuItems = await prisma.menuItem.findMany({ where: { tenantId }, include: { stockProduct: true } });
  const stockProducts = await prisma.stockProduct.findMany({ where: { tenantId } });
  const uhs = await prisma.uH.findMany({ where: { tenantId }, select: { numero: true } });
  const uhNumeros = uhs.map((u) => u.numero);
  const atendimento = await prisma.user.findFirst({ where: { tenantId, email: "atendimento@avel.com" } });
  const atendimentoId = atendimento?.id;

  console.log(`[avel-mod] estoque/restaurante: processando dias ${DAY_START}..${DAY_END} de ${DIAS}`);
  let totalPedidos = 0;
  let totalMovimentos = 0;

  for (let dia = DAY_START; dia <= DAY_END; dia++) {
    const data = addDays(inicioPeriodo, dia);
    const t = dia / (DIAS - 1);
    const isRecentDay = dia >= DIAS - 2;

    const nOrders = Math.random() < 0.55 + 0.35 * t ? randInt(1, 3) : 0;
    for (let k = 0; k < nOrders; k++) {
      const tipo = pick(["SINGLE", "DOUBLE"]);
      const nItens = randInt(3, 6);
      const itensEscolhidos = shuffle(menuItems).slice(0, Math.min(nItens, menuItems.length));
      const status = isRecentDay ? pick(["RECEBIDO", "PREPARACAO", "ENTREGA"]) : Math.random() < 0.9 ? "FINALIZADO" : "RECEBIDO";
      const horaConfirmacao = atHour(data, 6, randInt(0, 59));

      const order = await prisma.breakfastOrder.create({
        data: {
          tenantId,
          token: `avel-d${dia}-k${k}-${Math.random().toString(36).slice(2, 8)}`,
          clienteNome: pick(NOMES_HOSPEDES),
          uhNumero: uhNumeros.length ? pick(uhNumeros) : "101",
          tipo,
          status,
          horarioEntrega: pick(["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"]),
          confirmadoEm: horaConfirmacao,
          estoqueBaixadoEm: status === "FINALIZADO" ? atHour(data, randInt(7, 10), 0) : null,
          criadoPorNome: "Atendimento",
          createdAt: atHour(data, 6, 0),
          itens: { create: itensEscolhidos.map((mi) => ({ menuItemId: mi.id, quantidade: randInt(1, 2) })) },
        },
        include: { itens: { include: { menuItem: true } } },
      });
      totalPedidos++;

      if (status === "FINALIZADO") {
        for (const oi of order.itens) {
          const qtd = oi.quantidade * oi.menuItem.quantidadePorPorcao;
          await prisma.stockMovement.create({
            data: {
              tenantId, productId: oi.menuItem.stockProductId, tipo: "SAIDA", quantidade: qtd,
              usuarioId: atendimentoId, usuarioNome: "Atendimento",
              observacao: `Pedido de café — ${order.clienteNome} (${order.uhNumero})`,
              createdAt: order.estoqueBaixadoEm ?? data,
            },
          });
          await prisma.stockProduct.update({ where: { id: oi.menuItem.stockProductId }, data: { quantidade: { decrement: qtd } } });
          totalMovimentos++;
        }
      }
    }

    if (dia % 7 === 0) {
      for (const p of stockProducts) {
        if (Math.random() < 0.7) {
          const qtd = randInt(10, 50);
          await prisma.stockMovement.create({
            data: { tenantId, productId: p.id, tipo: "ENTRADA", quantidade: qtd, usuarioNome: "Sistema", observacao: "Reposição semanal", createdAt: atHour(data, 8, 0) },
          });
          await prisma.stockProduct.update({ where: { id: p.id }, data: { quantidade: { increment: qtd } } });
          totalMovimentos++;
        }
      }
    }

    const dataStr = toDateStr(data);
    console.log(`[avel-mod] estoque/restaurante: dia ${dia + 1}/${DIAS} (${dataStr}) — pedidos neste run: ${totalPedidos}, movimentos: ${totalMovimentos}`);

    if (Date.now() - inicioExecucao > ORCAMENTO_MS && dia < DAY_END) {
      console.log(`[avel-mod] orçamento de tempo atingido — parou depois do dia ${dia} (${dataStr}). Continue com SEED_DAY_START=${dia + 1}.`);
      return;
    }
  }
  console.log(`[avel-mod] estoque/restaurante: TODOS OS DIAS PROCESSADOS.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// AVALIAÇÕES — reviews de Booking/Airbnb chegando esparsamente ao longo dos 6
// meses (nota subindo com o tempo — hotel melhorando), + um recorte de
// queixas internas (GuestComplaint já existentes do módulo Governança)
// espelhadas como cards INTERNO.
// ═══════════════════════════════════════════════════════════════════════════
async function runReviews(tenantId: string) {
  const inicioExecucao = Date.now();
  const hoje = atHour(new Date(), 12, 0);
  const inicioPeriodo = addDays(hoje, -(DIAS - 1));

  const property = await prisma.property.findFirst({ where: { tenantId } });
  if (!property) throw new Error("[avel-mod] nenhuma Property encontrada — rode o seed principal primeiro.");
  const categorias = await prisma.category.findMany({ where: { tenantId } });
  const gerente = await prisma.user.findFirst({ where: { tenantId, email: "gerente@avel.com" } });
  const atendimento = await prisma.user.findFirst({ where: { tenantId, email: "atendimento@avel.com" } });
  const governanta = await prisma.user.findFirst({ where: { tenantId, email: "governanta@avel.com" } });
  const analistaId = gerente?.id ?? atendimento?.id ?? governanta?.id;
  if (!analistaId) throw new Error("[avel-mod] nenhum usuário encontrado pra ser o autor dos logs de Avaliações.");

  const complaintsSemReview = await prisma.guestComplaint.findMany({
    where: { tenantId, reviewId: null },
    take: 15,
  });
  let complaintIdx = 0;

  console.log(`[avel-mod] avaliações: processando dias ${DAY_START}..${DAY_END} de ${DIAS}`);
  let totalReviews = 0;

  for (let dia = DAY_START; dia <= DAY_END; dia++) {
    const data = addDays(inicioPeriodo, dia);
    const t = dia / (DIAS - 1);

    // ~1 review a cada 2-3 dias, em média
    const chance = 0.4;
    if (Math.random() >= chance) continue;

    const usarQueixaInterna = complaintIdx < complaintsSemReview.length && Math.random() < 0.25;
    const complaint = usarQueixaInterna ? complaintsSemReview[complaintIdx++] : null;

    const platform: "BOOKING" | "AIRBNB" | "INTERNO" = complaint ? "INTERNO" : Math.random() < 0.6 ? "BOOKING" : "AIRBNB";
    const ratingScaleMax = platform === "AIRBNB" ? 5 : 10;

    // hotel melhorando: média 3.6 -> 4.6 (escala 0-5), com ruído
    const mediaEsperada = 3.6 + 1.0 * t;
    let ratingNormalized = Math.min(5, Math.max(1, mediaEsperada + rand(-1, 1)));
    ratingNormalized = Math.round(ratingNormalized * 2) / 2; // múltiplos de 0.5
    const ratingRaw = platform === "AIRBNB" ? ratingNormalized : Math.round((ratingNormalized / 5) * ratingScaleMax * 10) / 10;

    const negativo = ratingNormalized <= 3;
    const positivo = ratingNormalized >= 4.5;
    const comment = complaint
      ? complaint.descricao
      : negativo
      ? pick(COMENTARIOS_NEGATIVOS)
      : positivo
      ? pick(COMENTARIOS_POSITIVOS)
      : pick(COMENTARIOS_NEUTROS);

    const isRecentDay = dia >= DIAS - 3;
    let stage: "RECEBIDA" | "ANALISE_PLANEJAMENTO" | "EXECUCAO" | "AVALIACAO_EFICACIA" | "FINALIZADA";
    if (isRecentDay) stage = "RECEBIDA";
    else if (dia >= DIAS - 10) stage = pick(["ANALISE_PLANEJAMENTO", "EXECUCAO"]);
    else if (dia >= DIAS - 20) stage = pick(["EXECUCAO", "AVALIACAO_EFICACIA", "FINALIZADA"]);
    else stage = "FINALIZADA";

    const skippedToFinal = positivo && stage === "FINALIZADA" && Math.random() < 0.5;

    const guestSubmittedAt = atHour(data, randInt(8, 22), randInt(0, 59));
    const collectedAt = addDays(guestSubmittedAt, 0);
    const analysisDueAt = addDays(guestSubmittedAt, 3);
    const analysisCompletedAt = stage !== "RECEBIDA" && !skippedToFinal ? addDays(guestSubmittedAt, randInt(1, 3)) : null;

    const categoriasEscolhidas = negativo
      ? shuffle(categorias.filter((c) => ["Limpeza", "Manutenção", "Atendimento", "Enxoval"].includes(c.name))).slice(0, randInt(1, 2))
      : shuffle(categorias).slice(0, randInt(1, 2));

    const review = await prisma.review.create({
      data: {
        tenantId, propertyId: property.id,
        platform, guestName: complaint ? complaint.titulo : pick(NOMES_HOSPEDES),
        comment,
        ratingRaw, ratingScaleMax, ratingNormalized,
        guestSubmittedAt, collectedAt,
        stage, skippedToFinal,
        analysisDueAt,
        analyzedById: analysisCompletedAt ? analistaId : null,
        analysisCompletedAt,
        createdAt: guestSubmittedAt,
        categories: { create: categoriasEscolhidas.map((c) => ({ categoryId: c.id })) },
      },
    });
    totalReviews++;

    if (complaint) {
      await prisma.guestComplaint.update({ where: { id: complaint.id }, data: { reviewId: review.id } });
    }

    if (negativo && atendimento) {
      await prisma.reviewAttendant.create({
        data: { reviewId: review.id, attendantId: atendimento.id, score: Math.max(1, ratingNormalized - 0.5), observation: "Atendimento avaliado com base no relato do hóspede." },
      });
    }

    if (stage !== "RECEBIDA" && !skippedToFinal && ratingNormalized < 4.2) {
      const actionPlan = await prisma.actionPlan.create({ data: { reviewId: review.id, createdAt: analysisCompletedAt ?? guestSubmittedAt } });
      const nItens = randInt(1, 3);
      for (let i = 0; i < nItens; i++) {
        const dueDate = addDays(analysisCompletedAt ?? guestSubmittedAt, randInt(3, 10));
        const concluido = stage === "EXECUCAO" || stage === "AVALIACAO_EFICACIA" || stage === "FINALIZADA";
        await prisma.actionItem.create({
          data: {
            actionPlanId: actionPlan.id,
            description: pick(["Reforçar checklist de limpeza da UH", "Abrir chamado de manutenção preventiva", "Retreinar equipe de atendimento", "Revisar reposição de enxoval"]),
            dueDate,
            completedAt: concluido ? addDays(dueDate, -randInt(0, 3)) : null,
            completedById: concluido ? (governanta?.id ?? gerente?.id) : null,
          },
        });
      }
    }

    if (stage === "AVALIACAO_EFICACIA" || stage === "FINALIZADA") {
      await prisma.efficacyCheck.create({
        data: {
          reviewId: review.id,
          scheduledDate: addDays(guestSubmittedAt, randInt(15, 25)),
          description: "Verificação de eficácia da ação tomada.",
          completedAt: stage === "FINALIZADA" ? addDays(guestSubmittedAt, randInt(20, 30)) : null,
          wasEffective: stage === "FINALIZADA" ? Math.random() < 0.85 : null,
        },
      });
    }

    const logsData: { action: string; detail: string; createdAt: Date }[] = [
      { action: "RECEBIDA", detail: "Avaliação recebida.", createdAt: guestSubmittedAt },
    ];
    if (stage !== "RECEBIDA") {
      logsData.push({ action: "ANALISE_INICIADA", detail: "Análise iniciada.", createdAt: addDays(guestSubmittedAt, 1) });
      if (!skippedToFinal) logsData.push({ action: "ANALISE_CONCLUIDA", detail: "Plano de ação definido.", createdAt: analysisCompletedAt ?? addDays(guestSubmittedAt, 2) });
    }
    if (stage === "EXECUCAO" || stage === "AVALIACAO_EFICACIA" || stage === "FINALIZADA") {
      logsData.push({ action: "EXECUCAO_CONCLUIDA", detail: "Ações executadas.", createdAt: addDays(guestSubmittedAt, randInt(5, 12)) });
    }
    if (stage === "FINALIZADA") {
      logsData.push({ action: "CARD_FINALIZADO", detail: "Card finalizado.", createdAt: addDays(guestSubmittedAt, randInt(20, 30)) });
    }
    for (const log of logsData) {
      await prisma.reviewLog.create({
        data: { reviewId: review.id, actorId: analistaId, action: log.action, detail: log.detail, createdAt: log.createdAt },
      });
    }

    if (totalReviews % 10 === 0) {
      console.log(`[avel-mod] avaliações: dia ${dia + 1}/${DIAS}, reviews neste run: ${totalReviews}`);
    }

    if (Date.now() - inicioExecucao > ORCAMENTO_MS && dia < DAY_END) {
      console.log(`[avel-mod] orçamento de tempo atingido — parou depois do dia ${dia} (${toDateStr(data)}). Continue com SEED_DAY_START=${dia + 1}.`);
      return;
    }
  }
  console.log(`[avel-mod] avaliações: TODOS OS DIAS PROCESSADOS. Total de reviews criadas neste run: ${totalReviews}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
