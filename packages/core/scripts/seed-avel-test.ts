// Seed de hotel-teste completo — pedido explícito do Felipe: tenant "Avel"
// (slug "avel"), 27 UHs, 4 camareiras, 6 meses (183 dias) de histórico
// realista de Governança (Seleção/Atribuição/Limpeza/Inspeção), com
// métricas evoluindo ao longo do tempo (duração de limpeza caindo, taxa de
// falha caindo — hotel "amadurecendo"), mais eventos esparsos (queixas de
// hóspede, falhas de lavanderia, falhas gerenciais) pra nenhuma tela ficar
// vazia. Roda com: npx tsx scripts/seed-avel-test.ts (de dentro de
// packages/core) — idempotente na parte de tenant/usuários/UHs (upsert),
// mas a parte histórica (assignments/sessions/inspeções) SEMPRE insere de
// novo se rodado 2x (não há chave natural pra dedupe aí) — não rodar 2x.

import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";
import { createTenant } from "../src/tenant";

// SEED_SLUG/SEED_DIAS/SEED_NOME permitem rodar um "ensaio" rápido (poucos
// dias, slug descartável) antes do run de verdade. SEED_DAY_START/
// SEED_DAY_END processam só uma fatia do intervalo de dias — o sandbox mata
// qualquer processo que passe de ~45s (nohup/disown não sobrevivem, cada
// invocação do bash roda numa sandbox própria com --die-with-parent), então
// o run de verdade precisa ser fatiado em várias chamadas curtas, cada uma
// processando um pedaço do range de dias (idempotente por dia: cada dia só é
// processado uma vez, então rodar fatias sequenciais é seguro).
const SLUG = process.env.SEED_SLUG ?? "avel";
const NOME_TENANT = process.env.SEED_NOME ?? "Avel";
const SENHA = "avel123"; // trocar depois do primeiro login, mesmo padrão do seed-test-tenant.ts
const DIAS = process.env.SEED_DIAS ? parseInt(process.env.SEED_DIAS, 10) : 183; // ~6 meses
const DAY_START = process.env.SEED_DAY_START ? parseInt(process.env.SEED_DAY_START, 10) : 0;
const DAY_END = process.env.SEED_DAY_END ? parseInt(process.env.SEED_DAY_END, 10) : DIAS - 1; // inclusive
const CONCORRENCIA = 8; // UHs processadas em paralelo dentro de cada dia

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

// Checklist de inspeção — 10 itens CAMAREIRA + 2 GERENCIAIS (estrutura/
// mobília, não é culpa da camareira — ver comentário em InspectionTemplate
// sobre tipoFalha).
const TEMPLATE_ITEMS: { categoria: string; item: string; tipoFalha: string }[] = [
  { categoria: "CAMA", item: "Lençóis trocados e esticados", tipoFalha: "CAMAREIRA" },
  { categoria: "CAMA", item: "Travesseiros e capas limpos", tipoFalha: "CAMAREIRA" },
  { categoria: "BANHEIRO", item: "Toalhas repostas", tipoFalha: "CAMAREIRA" },
  { categoria: "BANHEIRO", item: "Amenities repostos", tipoFalha: "CAMAREIRA" },
  { categoria: "BANHEIRO", item: "Vaso sanitário e box higienizados", tipoFalha: "CAMAREIRA" },
  { categoria: "QUARTO", item: "Piso limpo", tipoFalha: "CAMAREIRA" },
  { categoria: "QUARTO", item: "Móveis sem poeira", tipoFalha: "CAMAREIRA" },
  { categoria: "QUARTO", item: "Cortinas alinhadas", tipoFalha: "CAMAREIRA" },
  { categoria: "GERAL", item: "Lixeiras esvaziadas", tipoFalha: "CAMAREIRA" },
  { categoria: "GERAL", item: "Cheiro agradável / ventilado", tipoFalha: "CAMAREIRA" },
  { categoria: "GERAL", item: "Mobília sem avarias", tipoFalha: "GERENCIAL" },
  { categoria: "GERAL", item: "Pintura e paredes em bom estado", tipoFalha: "GERENCIAL" },
];

const DESCRICOES_FALHA_GERENCIAL = [
  "Sofá com rasgo no tecido — precisa de reparo ou troca.",
  "Mancha de umidade na parede, perto da janela.",
  "Gaveta da cômoda empenada, não fecha direito.",
  "Tinta descascando perto do box do banheiro.",
  "Pé da cama solto, range ao deitar.",
];

const DESCRICOES_QUEIXA = [
  "Hóspede relatou UH suja na chegada — cabelo no chão do banheiro.",
  "Reclamação de cheiro de mofo no quarto.",
  "Hóspede relatou toalhas manchadas.",
  "Reclamação de poeira acumulada nos móveis.",
];

const DESCRICOES_LAVANDERIA = [
  "Lençol devolvido com mancha que não saiu na lavagem.",
  "Toalha rasgada na máquina de lavar.",
  "Fronha com defeito de costura após lavagem.",
];

async function main() {
  const inicioExecucao = Date.now();
  console.log("[avel] criando tenant + usuário MASTER...");
  const { tenantId } = await createTenant({
    nome: NOME_TENANT,
    slug: SLUG,
    email: "felipe_mello86@hotmail.com",
    nomeUsuario: "Felipe Mello",
    senha: SENHA,
    modules: ["HOUSEKEEPING"],
  });

  console.log("[avel] criando property...");
  const property = await prisma.property.upsert({
    where: { tenantId_nome: { tenantId, nome: NOME_TENANT } },
    update: {},
    create: { tenantId, nome: NOME_TENANT },
  });

  console.log("[avel] criando usuários (gerente, atendimento, governanta, 4 camareiras)...");
  async function upsertUser(email: string, nome: string, role: string) {
    const passwordHash = await bcrypt.hash(SENHA, 10);
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: {},
      create: { tenantId, nome, email, passwordHash, role },
    });
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: user.id, module: "HOUSEKEEPING" } },
      update: { enabled: true },
      create: { userId: user.id, module: "HOUSEKEEPING", enabled: true },
    });
    return user;
  }

  const gerente = await upsertUser("gerente@avel.com", "Rafael Gerente", "GERENTE");
  const atendimento = await upsertUser("atendimento@avel.com", "Juliana Atendimento", "ATENDIMENTO");
  const governanta = await upsertUser("governanta@avel.com", "Marta Governanta", "GOVERNANTA");

  const CAMAREIRAS = [
    { email: "ana@avel.com", nome: "Ana Paula", skill: 0.9, quality: 0.85 },
    { email: "bruna@avel.com", nome: "Bruna Costa", skill: 1.05, quality: 1.0 },
    { email: "carla@avel.com", nome: "Carla Souza", skill: 1.15, quality: 1.2 },
    { email: "diana@avel.com", nome: "Diana Lima", skill: 0.95, quality: 0.9 },
  ];
  const camareiraUsers = [];
  for (const c of CAMAREIRAS) {
    const u = await upsertUser(c.email, c.nome, "CAMAREIRA");
    camareiraUsers.push({ ...c, id: u.id });
  }

  console.log("[avel] criando 27 UHs...");
  const NUMEROS: { numero: string; tipo: string }[] = [];
  for (const andar of [1, 2, 3]) {
    for (let n = 1; n <= 9; n++) {
      const numero = `${andar}0${n}`;
      const tipo = n <= 6 ? "Standard" : n <= 8 ? "Luxo" : "Suite";
      NUMEROS.push({ numero, tipo });
    }
  }
  const uhs = [];
  for (let i = 0; i < NUMEROS.length; i++) {
    const { numero, tipo } = NUMEROS[i];
    const uh = await prisma.uH.upsert({
      where: { tenantId_numero: { tenantId, numero } },
      update: {},
      create: { tenantId, propertyId: property.id, numero, tipo, ordem: i },
    });
    uhs.push(uh);
  }

  console.log("[avel] criando checklist de inspeção (12 itens)...");
  const jaTemChecklist = await prisma.inspectionTemplate.count({ where: { tenantId } });
  let templateItems: { categoria: string; item: string; tipoFalha: string }[] = TEMPLATE_ITEMS;
  if (jaTemChecklist === 0) {
    await prisma.inspectionTemplate.createMany({
      data: TEMPLATE_ITEMS.map((it, ordem) => ({ tenantId, ...it, ordem })),
    });
  } else {
    const existentes = await prisma.inspectionTemplate.findMany({ where: { tenantId } });
    templateItems = existentes.map((e) => ({ categoria: e.categoria, item: e.item, tipoFalha: e.tipoFalha }));
  }

  // ---------------------------------------------------------------------
  // Histórico de 6 meses
  // ---------------------------------------------------------------------
  const hoje = atHour(new Date(), 12, 0);
  const inicio = addDays(hoje, -(DIAS - 1));

  let totalAssignments = 0;
  let totalInspecoes = 0;
  let totalQueixas = 0;
  let totalLavanderia = 0;
  let totalCardsGerenciais = 0;

  async function processarUH(params: {
    dia: Date;
    dataStr: string;
    t: number;
    isRecentDay: boolean;
    uh: (typeof uhs)[number];
    cam: (typeof camareiraUsers)[number];
    i: number;
  }) {
    const { dia, dataStr, t, isRecentDay, uh, cam, i } = params;

    const duracaoMedia = (2700 - t * 750) * cam.skill; // 45min -> ~32min, modulado por skill
    const falhaProb = Math.min(0.6, Math.max(0.03, (0.35 - t * 0.25) * cam.quality));

    const iniciadaEm = atHour(dia, randInt(8, 11), randInt(0, 59));

    let status: string;
    let temSessao = true;
    let sessaoFinalizada = true;
    let temInspecao = true;

    if (isRecentDay) {
      const r = Math.random();
      if (r < 0.15) {
        status = "PENDENTE";
        temSessao = false;
        sessaoFinalizada = false;
        temInspecao = false;
      } else if (r < 0.3) {
        status = "EM_ANDAMENTO";
        sessaoFinalizada = false;
        temInspecao = false;
      } else if (r < 0.55) {
        status = "CONCLUIDO";
        temInspecao = false;
      } else {
        status = "INSPECIONADO";
      }
    } else {
      temInspecao = Math.random() < 0.85;
      status = temInspecao ? "INSPECIONADO" : "CONCLUIDO";
    }

    const duracaoSegundos = sessaoFinalizada ? Math.max(600, randInt(duracaoMedia - 300, duracaoMedia + 300)) : null;
    const finalizadaEm = sessaoFinalizada && duracaoSegundos ? new Date(iniciadaEm.getTime() + duracaoSegundos * 1000) : null;

    const inspIniciadaEm = temInspecao && finalizadaEm ? new Date(finalizadaEm.getTime() + randInt(5, 25) * 60000) : null;
    const inspFinalizadaEm = inspIniciadaEm ? new Date(inspIniciadaEm.getTime() + randInt(4, 12) * 60000) : null;

    let itemsData: { categoria: string; item: string; ordem: number; resultado: string; tipoFalha: string }[] = [];
    let totalFalhas = 0;
    let totalFalhasGerenciais = 0;
    if (temInspecao) {
      itemsData = templateItems.map((tpl, ordem) => {
        const falhou = Math.random() < falhaProb;
        if (falhou) {
          if (tpl.tipoFalha === "GERENCIAL") totalFalhasGerenciais++;
          else totalFalhas++;
        }
        return { categoria: tpl.categoria, item: tpl.item, ordem, resultado: falhou ? "FALHA" : "OK", tipoFalha: tpl.tipoFalha };
      });
    }

    const liberadaEm = atHour(dia, 7, randInt(0, 45));

    const created = await prisma.dailyAssignment.create({
      data: {
        tenantId,
        data: dataStr,
        uhId: uh.id,
        camareiraId: cam.id,
        status,
        liberadaEm,
        criadoPorNome: atendimento.nome,
        ...(temSessao
          ? {
              cleaningSession: {
                create: {
                  uhId: uh.id,
                  camareiraId: cam.id,
                  iniciadaEm,
                  finalizadaEm,
                  duracaoSegundos,
                  fotos: "{}",
                  ...(temInspecao && inspIniciadaEm
                    ? {
                        inspection: {
                          create: {
                            uhId: uh.id,
                            governantaId: governanta.id,
                            iniciadaEm: inspIniciadaEm,
                            finalizadaEm: inspFinalizadaEm,
                            totalFalhas,
                            totalFalhasGerenciais,
                            itens: { create: itemsData },
                          },
                        },
                      }
                    : {}),
                },
              },
            }
          : {}),
      },
      include: temInspecao
        ? { cleaningSession: { include: { inspection: { include: { itens: true } } } } }
        : undefined,
    });

    totalAssignments++;
    if (temInspecao) totalInspecoes++;

    // Item(ns) GERENCIAL marcado(s) FALHA vira(m) card em Falhas Gerenciais
    // (mesmo efeito colateral que o app produziria via PATCH /api/inspecoes).
    if (temInspecao) {
      const inspecaoRow = (created as any).cleaningSession?.inspection;
      const itemsGerenciaisFalha = (inspecaoRow?.itens ?? []).filter(
        (it: any) => it.tipoFalha === "GERENCIAL" && it.resultado === "FALHA",
      );
      for (const it of itemsGerenciaisFalha) {
        const resolvido = i < DIAS - 20; // eventos com mais de ~20 dias já foram resolvidos
        await prisma.hkManagerialFailureCard.create({
          data: {
            tenantId,
            inspectionItemId: it.id,
            uhId: uh.id,
            itemNome: it.item,
            descricao: pick(DESCRICOES_FALHA_GERENCIAL),
            status: resolvido ? "RESOLVIDO" : "PENDENTE",
            ...(resolvido
              ? {
                  resolvedDescricao: "Reparo realizado pela manutenção.",
                  resolvedAt: new Date((inspFinalizadaEm ?? dia).getTime() + randInt(1, 5) * 86400000),
                  resolvedById: governanta.id,
                }
              : {}),
            createdAt: inspFinalizadaEm ?? dia,
          },
        });
        totalCardsGerenciais++;
      }
    }

    // Eventos esparsos (queixa de hóspede / falha de lavanderia) — mais
    // frequentes no início (qualidade ainda instável), mais raros perto de
    // hoje (hotel mais maduro).
    const probEvento = 0.02 * (1 - t * 0.6);
    if (Math.random() < probEvento) {
      await prisma.guestComplaint.create({
        data: {
          tenantId,
          data: dataStr,
          uhId: uh.id,
          titulo: "Queixa de limpeza",
          tipo: "LIMPEZA",
          descricao: pick(DESCRICOES_QUEIXA),
          registradoPorId: atendimento.id,
          registradoPorNome: atendimento.nome,
          camareiraId: cam.id,
          pontosDescontados: randInt(5, 20),
          createdAt: atHour(dia, randInt(9, 18), randInt(0, 59)),
        },
      });
      totalQueixas++;
    }
    if (Math.random() < probEvento * 0.7) {
      await prisma.falhaLavanderia.create({
        data: {
          tenantId,
          data: dataStr,
          uhNumero: uh.numero,
          descricao: pick(DESCRICOES_LAVANDERIA),
          reportadoPorNome: Math.random() < 0.5 ? cam.nome : governanta.nome,
          reportadoPorRole: Math.random() < 0.5 ? "CAMAREIRA" : "GOVERNANTA",
          createdAt: atHour(dia, randInt(9, 18), randInt(0, 59)),
        },
      });
      totalLavanderia++;
    }
  }

  console.log(`[avel] processando dias ${DAY_START}..${DAY_END} de ${DIAS}...`);
  for (let i = DAY_START; i <= DAY_END; i++) {
    const dia = addDays(inicio, i);
    const dataStr = toDateStr(dia);
    const t = i / (DIAS - 1); // 0 (início) -> 1 (hoje) — evolução ao longo do tempo
    const isRecentDay = i >= DIAS - 2; // hoje e ontem: mistura de status "em andamento"

    // Ocupação do dia: base + leve sazonalidade + fim de semana mais cheio +
    // crescimento gradual do hotel ao longo dos 6 meses + ruído aleatório.
    const weekday = dia.getUTCDay();
    const weekendBoost = weekday === 5 || weekday === 6 ? 0.12 : 0;
    const seasonWave = Math.sin((i / DIAS) * Math.PI * 2) * 0.08;
    const trendGrowth = t * 0.15;
    let occRate = 0.5 + weekendBoost + seasonWave + trendGrowth + rand(-0.05, 0.05);
    occRate = Math.min(0.92, Math.max(0.3, occRate));
    const numUHs = Math.max(3, Math.round(occRate * uhs.length));
    const uhsHoje = shuffle(uhs).slice(0, numUHs);

    // DailyUHSelection em lote — todas liberadas de manhã (Atendimento).
    const liberadaEm = atHour(dia, 7, randInt(0, 45));
    await prisma.dailyUHSelection.createMany({
      data: uhsHoje.map((uh) => ({
        tenantId,
        data: dataStr,
        uhId: uh.id,
        liberada: true,
        liberadaEm,
        liberadoPorNome: atendimento.nome,
      })),
    });

    // Distribui as UHs de hoje entre as 4 camareiras, round-robin embaralhado
    // (carga parecida pra todas, sem ficar sempre na mesma ordem).
    const ordemCamareiras = shuffle(camareiraUsers);

    // Processa as UHs do dia em lotes concorrentes (não sequencial) — cada
    // dia sozinho é rápido o bastante pra não estourar o orçamento de tempo
    // de uma única invocação (ver CONCORRENCIA e o corte de tempo abaixo).
    for (let idx = 0; idx < uhsHoje.length; idx += CONCORRENCIA) {
      const lote = uhsHoje.slice(idx, idx + CONCORRENCIA);
      await Promise.all(
        lote.map((uh, offset) =>
          processarUH({
            dia,
            dataStr,
            t,
            isRecentDay,
            uh,
            cam: ordemCamareiras[(idx + offset) % ordemCamareiras.length],
            i,
          }),
        ),
      );
    }

    console.log(
      `[avel] dia ${i + 1}/${DIAS} (${dataStr}) — ${uhsHoje.length} UHs, ` +
        `assignments neste run: ${totalAssignments}, inspeções: ${totalInspecoes}`,
    );

    // Corte de tempo — o sandbox mata o processo perto de ~45s, então cada
    // invocação processa o máximo de dias inteiros que couber num orçamento
    // seguro e para (nunca no meio de um dia). O chamador olha o último
    // "dia X/DIAS" impresso e continua de lá com SEED_DAY_START na próxima
    // chamada.
    if (Date.now() - inicioExecucao > 32000 && i < DAY_END) {
      console.log(`[avel] orçamento de tempo atingido — parou depois do dia ${i} (${dataStr}). Continue com SEED_DAY_START=${i + 1}.`);
      return;
    }
  }

  console.log("[avel] fatia concluída.");
  console.log({ totalAssignments, totalInspecoes, totalQueixas, totalLavanderia, totalCardsGerenciais });
  if (DAY_END >= DIAS - 1) {
    console.log("[avel] ESSE ERA O ÚLTIMO DIA — seed completo.");
    console.log("Login: qualquer e-mail abaixo, senha:", SENHA);
    console.log([
      "felipe_mello86@hotmail.com (MASTER)",
      "gerente@avel.com (GERENTE)",
      "atendimento@avel.com (ATENDIMENTO)",
      "governanta@avel.com (GOVERNANTA)",
      ...CAMAREIRAS.map((c) => `${c.email} (CAMAREIRA)`),
    ]);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
