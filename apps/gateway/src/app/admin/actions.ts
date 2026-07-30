"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import {
  prisma,
  createTenant,
  getAdminSession,
  requireAdminSession,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  setSessionCookie,
  criarLinkDeCheckout,
  criarLinkDePortal,
  type SuiteModule,
} from "@praxis/core";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

// Login do painel admin — completamente separado do login de tenant (ver
// [cliente]/actions.ts). PlatformAdmin não tem tenantId; a checagem é só
// contra a tabela PlatformAdmin.
export async function loginAdminAction(
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) return { ok: false, error: "Informe e-mail e senha." };

  const admin = await prisma.platformAdmin.findUnique({ where: { email } });
  if (!admin || !admin.ativo) return { ok: false, error: "E-mail ou senha incorretos." };

  const confere = await bcrypt.compare(senha, admin.passwordHash);
  if (!confere) return { ok: false, error: "E-mail ou senha incorretos." };

  await setAdminSessionCookie({ adminId: admin.id, nome: admin.nome, email: admin.email });
  redirect("/admin");
}

export async function logoutAdminAction() {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}

export type CriarClienteResult = { ok: true; slug: string } | { ok: false; error: string };

export async function criarClienteAction(
  _prevState: CriarClienteResult | null,
  formData: FormData
): Promise<CriarClienteResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const nomeUsuario = String(formData.get("nomeUsuario") ?? "").trim() || undefined;
  const modules = formData.getAll("modules").map(String) as SuiteModule[];

  if (!nome || !slug) return { ok: false, error: "Nome e slug são obrigatórios." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Slug só pode ter letras minúsculas, números e hífen." };
  }
  if (!email || !senha) return { ok: false, error: "E-mail e senha do usuário MASTER são obrigatórios." };
  if (senha.length < 6) return { ok: false, error: "A senha precisa ter pelo menos 6 caracteres." };

  const existente = await prisma.tenant.findUnique({ where: { slug } });
  if (existente) return { ok: false, error: "Já existe um cliente com esse slug." };

  await createTenant({ nome, slug, email, senha, nomeUsuario, modules });

  redirect("/admin");
}

/**
 * "Acessar o sistema do cliente" — emite uma sessão de TENANT normal (a
 * mesma que o usuário MASTER teria após um login de verdade), marcada com
 * viaAdmin: true só pra exibir o aviso visual no hub. Decisão explícita do
 * Felipe: entrar como o MASTER do cliente, não uma visão separada.
 */
export async function impersonarAction(tenantId: string) {
  await requireAdminSession(); // lança e aborta se não houver sessão de admin válida

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Cliente não encontrado.");

  const master = await prisma.user.findFirst({
    where: { tenantId, role: "MASTER" },
    orderBy: { createdAt: "asc" },
  });
  if (!master) throw new Error("Este cliente não tem nenhum usuário MASTER cadastrado.");

  const access = await prisma.userModuleAccess.findMany({
    where: { userId: master.id, enabled: true },
    select: { module: true },
  });

  await setSessionCookie({
    userId: master.id,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    nome: master.nome,
    email: master.email,
    role: master.role,
    modules: access.map((a) => a.module),
    viaAdmin: true,
  });

  redirect(`/${tenant.slug}`);
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

export async function gerarLinkCheckoutAction(
  _prevState: CheckoutResult | null,
  formData: FormData
): Promise<CheckoutResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  if (!tenantId || !planId) return { ok: false, error: "Selecione um plano." };

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, error: "Cliente não encontrado." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sistemaspraxis.com.br";

  try {
    const url = await criarLinkDeCheckout({
      tenantId,
      planId,
      successUrl: `${appUrl}/admin/clientes/${tenantId}?checkout=sucesso`,
      cancelUrl: `${appUrl}/admin/clientes/${tenantId}?checkout=cancelado`,
    });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao gerar o link de checkout." };
  }
}

export async function gerarLinkPortalAction(
  _prevState: CheckoutResult | null,
  formData: FormData
): Promise<CheckoutResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { ok: false, error: "Cliente inválido." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sistemaspraxis.com.br";

  try {
    const url = await criarLinkDePortal({ tenantId, returnUrl: `${appUrl}/admin/clientes/${tenantId}` });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao gerar o link do portal." };
  }
}

export async function criarPlanoAction(
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  const stripePriceId = String(formData.get("stripePriceId") ?? "").trim();
  const valorReais = String(formData.get("valorReais") ?? "").trim();
  const intervalo = String(formData.get("intervalo") ?? "MONTH");

  if (!nome || !stripePriceId || !valorReais) {
    return { ok: false, error: "Preencha nome, Price ID do Stripe e valor." };
  }

  const valorCentavos = Math.round(parseFloat(valorReais.replace(",", ".")) * 100);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, error: "Valor inválido." };
  }

  if (!stripePriceId.startsWith("price_")) {
    return {
      ok: false,
      error: "Isso parece um Product ID (prod_...). Cole o Price ID (price_...) — dentro do produto no Stripe, na seção de preços.",
    };
  }

  const jaExiste = await prisma.subscriptionPlan.findUnique({ where: { stripePriceId } });
  if (jaExiste) return { ok: false, error: "Já existe um plano com esse Price ID." };

  await prisma.subscriptionPlan.create({
    data: { nome, stripePriceId, valorCentavos, intervalo },
  });

  redirect("/admin");
}

export async function atualizarPlanoAction(
  planId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  const stripePriceId = String(formData.get("stripePriceId") ?? "").trim();
  const valorReais = String(formData.get("valorReais") ?? "").trim();
  const intervalo = String(formData.get("intervalo") ?? "MONTH");

  if (!nome || !stripePriceId || !valorReais) {
    return { ok: false, error: "Preencha nome, Price ID do Stripe e valor." };
  }
  if (!stripePriceId.startsWith("price_")) {
    return {
      ok: false,
      error: "Isso parece um Product ID (prod_...). Cole o Price ID (price_...) — dentro do produto no Stripe, na seção de preços.",
    };
  }

  const valorCentavos = Math.round(parseFloat(valorReais.replace(",", ".")) * 100);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, error: "Valor inválido." };
  }

  const conflito = await prisma.subscriptionPlan.findUnique({ where: { stripePriceId } });
  if (conflito && conflito.id !== planId) {
    return { ok: false, error: "Já existe outro plano com esse Price ID." };
  }

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { nome, stripePriceId, valorCentavos, intervalo },
  });

  redirect("/admin");
}

// "Excluir" é soft-delete (ativo: false) em vez de apagar a linha — planos já
// referenciados por uma TenantSubscription (planId) não podem ser apagados de
// verdade sem quebrar a FK, e mesmo os que não têm assinatura nenhuma ainda
// ficam mais seguros assim: histórico preservado, só sai da lista de planos
// ativos/selecionáveis.
export async function excluirPlanoAction(planId: string) {
  await requireAdminSession();
  await prisma.subscriptionPlan.update({ where: { id: planId }, data: { ativo: false } });
  redirect("/admin");
}

// ═══════════════════════════════════════════════════════════════════════════
// CRM (Fase 1, 30/07/2026) — funil de vendas dos leads da landing page.
// Ver PipelineStage/DemoLead/LeadActivity em schema.prisma. Substitui o
// antigo alternarLeadAtendidoAction (flag binária "atendido") por um funil
// com etapas de verdade + linha do tempo de atividades.
// ═══════════════════════════════════════════════════════════════════════════

// Move um lead pra outra etapa do funil — usado tanto no board (troca rápida
// pelo <select> do card) quanto na tela de detalhe. Registra a mudança na
// linha do tempo (LeadActivity) pra manter histórico de por onde o lead
// passou. Sair da etapa "Perdido" limpa motivoPerda automaticamente (senão
// ficaria um motivo de perda "fantasma" num lead reaberto).
export async function moverEtapaAction(leadId: string, novaEtapaId: string) {
  const admin = await requireAdminSession();
  const [lead, novaEtapa] = await Promise.all([
    prisma.demoLead.findUnique({ where: { id: leadId }, include: { stage: true } }),
    prisma.pipelineStage.findUnique({ where: { id: novaEtapaId } }),
  ]);
  if (!lead || !novaEtapa) redirect("/admin/crm");

  await prisma.$transaction([
    prisma.demoLead.update({
      where: { id: leadId },
      data: {
        stageId: novaEtapa.id,
        motivoPerda: novaEtapa.ehPerdido ? lead.motivoPerda : null,
      },
    }),
    prisma.leadActivity.create({
      data: {
        leadId,
        tipo: "MUDANCA_ETAPA",
        conteudo: lead.stage
          ? `${lead.stage.nome} → ${novaEtapa.nome}`
          : `→ ${novaEtapa.nome}`,
        autorNome: admin.nome,
      },
    }),
  ]);

  redirect("/admin/crm");
}

// Mesma lógica de moverEtapaAction, mas chamada de dentro da tela de
// detalhe do lead — redireciona de volta pra lá em vez de pro board.
export async function moverEtapaDetalheAction(leadId: string, novaEtapaId: string) {
  const admin = await requireAdminSession();
  const [lead, novaEtapa] = await Promise.all([
    prisma.demoLead.findUnique({ where: { id: leadId }, include: { stage: true } }),
    prisma.pipelineStage.findUnique({ where: { id: novaEtapaId } }),
  ]);
  if (!lead || !novaEtapa) redirect("/admin/crm");

  await prisma.$transaction([
    prisma.demoLead.update({
      where: { id: leadId },
      data: {
        stageId: novaEtapa.id,
        motivoPerda: novaEtapa.ehPerdido ? lead.motivoPerda : null,
      },
    }),
    prisma.leadActivity.create({
      data: {
        leadId,
        tipo: "MUDANCA_ETAPA",
        conteudo: lead.stage ? `${lead.stage.nome} → ${novaEtapa.nome}` : `→ ${novaEtapa.nome}`,
        autorNome: admin.nome,
      },
    }),
  ]);

  redirect(`/admin/crm/${leadId}`);
}

// Marca o lead como perdido: move pra etapa ehPerdido (assume que existe
// exatamente uma — garantida por garantirEtapasPadrao) e exige um motivo,
// registrado tanto em DemoLead.motivoPerda (pra aparecer destacado no card)
// quanto na linha do tempo (histórico, mesmo que o motivo seja editado depois).
export async function marcarPerdidoAction(
  leadId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await requireAdminSession();
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) return { ok: false, error: "Descreva o motivo da perda." };

  const [lead, etapaPerdido] = await Promise.all([
    prisma.demoLead.findUnique({ where: { id: leadId }, include: { stage: true } }),
    prisma.pipelineStage.findFirst({ where: { ehPerdido: true } }),
  ]);
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  if (!etapaPerdido) return { ok: false, error: "Nenhuma etapa de 'Perdido' configurada em /admin/crm/etapas." };

  await prisma.$transaction([
    prisma.demoLead.update({
      where: { id: leadId },
      data: { stageId: etapaPerdido.id, motivoPerda: motivo },
    }),
    prisma.leadActivity.create({
      data: {
        leadId,
        tipo: "MUDANCA_ETAPA",
        conteudo: `${lead.stage ? lead.stage.nome + " → " : ""}${etapaPerdido.nome} (${motivo})`,
        autorNome: admin.nome,
      },
    }),
  ]);

  redirect(`/admin/crm/${leadId}`);
}

// Adiciona uma nota manual na linha do tempo do lead — anotação livre de
// contato feito (ligação, WhatsApp, reunião etc). Fase 2 vai reusar essa
// mesma tabela (LeadActivityTipo.MENSAGEM) pra log de conversa.
export async function criarNotaAction(
  leadId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await requireAdminSession();
  const conteudo = String(formData.get("conteudo") ?? "").trim();
  if (!conteudo) return { ok: false, error: "Escreva alguma coisa antes de salvar." };

  await prisma.leadActivity.create({
    data: { leadId, tipo: "NOTA", conteudo, autorNome: admin.nome },
  });

  redirect(`/admin/crm/${leadId}`);
}

// Atribui (ou remove, se responsavelId vier vazio) o vendedor responsável
// por este lead. Feito só na tela de detalhe — o board mostra o responsável
// como badge somente leitura pra não poluir o card com mais um controle.
export async function atribuirResponsavelAction(leadId: string, responsavelId: string) {
  await requireAdminSession();
  await prisma.demoLead.update({
    where: { id: leadId },
    data: { responsavelId: responsavelId || null },
  });
  redirect(`/admin/crm/${leadId}`);
}

// Cria um lead direto no CRM, sem passar pelo formulário público da landing
// page — pra contatos que chegaram por telefone, indicação, evento etc.
// E-mail é opcional aqui (diferente do POST /api/demo) porque nem sempre dá
// pra saber o e-mail de quem ligou; entra em branco e pode ser completado
// depois. Já registra uma primeira nota na linha do tempo pra distinguir de
// um lead que veio do site.
export async function criarLeadManualAction(
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await requireAdminSession();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120);
  const hotel = String(formData.get("hotel") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 160);
  const telefone = String(formData.get("telefone") ?? "").trim().slice(0, 40);
  const mensagem = String(formData.get("mensagem") ?? "").trim().slice(0, 2000);

  if (!nome || !hotel || !telefone) {
    return { ok: false, error: "Preencha nome, hotel e telefone." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "E-mail inválido (ou deixe em branco)." };
  }

  const primeiraEtapa = await prisma.pipelineStage.findFirst({ orderBy: { ordem: "asc" } });

  const lead = await prisma.demoLead.create({
    data: { nome, hotel, email, telefone, mensagem: mensagem || null, stageId: primeiraEtapa?.id },
  });

  await prisma.leadActivity.create({
    data: { leadId: lead.id, tipo: "NOTA", conteudo: "Lead criado manualmente no Admin.", autorNome: admin.nome },
  });

  redirect("/admin/crm");
}

// ─── Gestão das etapas do funil (/admin/crm/etapas) ─────────────────────────

export async function criarEtapaAction(
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  await requireAdminSession();
  const nome = String(formData.get("nome") ?? "").trim();
  const ehGanho = formData.get("ehGanho") === "on";
  const ehPerdido = formData.get("ehPerdido") === "on";
  if (!nome) return { ok: false, error: "Dê um nome pra etapa." };

  const ultima = await prisma.pipelineStage.findFirst({ orderBy: { ordem: "desc" } });
  await prisma.pipelineStage.create({
    data: { nome, ordem: (ultima?.ordem ?? -1) + 1, ehGanho, ehPerdido },
  });

  redirect("/admin/crm/etapas");
}

export async function renomearEtapaAction(
  stageId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  await requireAdminSession();
  const nome = String(formData.get("nome") ?? "").trim();
  const ehGanho = formData.get("ehGanho") === "on";
  const ehPerdido = formData.get("ehPerdido") === "on";
  if (!nome) return { ok: false, error: "Dê um nome pra etapa." };

  await prisma.pipelineStage.update({ where: { id: stageId }, data: { nome, ehGanho, ehPerdido } });
  redirect("/admin/crm/etapas");
}

// Troca a "ordem" desta etapa com a da vizinha (anterior ou seguinte) —
// reordenação simples de lista, sem drag-and-drop (baixo volume de etapas,
// não compensa a complexidade de uma lib de DnD só pra isso).
export async function moverOrdemEtapaAction(stageId: string, direcao: "up" | "down") {
  await requireAdminSession();
  const etapas = await prisma.pipelineStage.findMany({ orderBy: { ordem: "asc" } });
  const idx = etapas.findIndex((e) => e.id === stageId);
  if (idx === -1) redirect("/admin/crm/etapas");

  const vizinhoIdx = direcao === "up" ? idx - 1 : idx + 1;
  if (vizinhoIdx < 0 || vizinhoIdx >= etapas.length) redirect("/admin/crm/etapas");

  const atual = etapas[idx];
  const vizinho = etapas[vizinhoIdx];
  await prisma.$transaction([
    prisma.pipelineStage.update({ where: { id: atual.id }, data: { ordem: vizinho.ordem } }),
    prisma.pipelineStage.update({ where: { id: vizinho.id }, data: { ordem: atual.ordem } }),
  ]);

  redirect("/admin/crm/etapas");
}

// Só permite excluir etapas sem nenhum lead — senão os leads ficariam com
// stageId apontando pro vazio. Erro mostrado via useFormState em vez de só
// redirecionar, pra ficar claro pro Felipe por que não excluiu.
export async function excluirEtapaAction(
  stageId: string,
  _prevState: AdminActionResult | null,
  _formData: FormData
): Promise<AdminActionResult> {
  await requireAdminSession();
  const qtdLeads = await prisma.demoLead.count({ where: { stageId } });
  if (qtdLeads > 0) {
    return { ok: false, error: `Essa etapa tem ${qtdLeads} lead(s). Mova-os pra outra etapa antes de excluir.` };
  }
  await prisma.pipelineStage.delete({ where: { id: stageId } });
  redirect("/admin/crm/etapas");
}

// ─── Campos personalizados do lead (/admin/crm/campos) ──────────────────────
// Ver LeadCampoPersonalizado/LeadCampoValor em schema.prisma — desenhado
// como EAV de propósito pra suportar campo novo (ex: "Instagram" na Fase 2)
// sem precisar de migration.

export async function criarCampoAction(
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  await requireAdminSession();
  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "TEXTO");
  const opcoes = String(formData.get("opcoes") ?? "").trim();
  if (!nome) return { ok: false, error: "Dê um nome pro campo." };
  if (tipo === "SELECAO" && !opcoes) {
    return { ok: false, error: "Liste as opções (separadas por vírgula) pra um campo de seleção." };
  }

  const ultimo = await prisma.leadCampoPersonalizado.findFirst({ orderBy: { ordem: "desc" } });
  await prisma.leadCampoPersonalizado.create({
    data: {
      nome,
      tipo: tipo as "TEXTO" | "NUMERO" | "DATA" | "SELECAO",
      ordem: (ultimo?.ordem ?? -1) + 1,
      opcoes: tipo === "SELECAO" ? opcoes : null,
    },
  });

  redirect("/admin/crm/campos");
}

export async function editarCampoAction(
  campoId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  await requireAdminSession();
  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "TEXTO");
  const opcoes = String(formData.get("opcoes") ?? "").trim();
  if (!nome) return { ok: false, error: "Dê um nome pro campo." };
  if (tipo === "SELECAO" && !opcoes) {
    return { ok: false, error: "Liste as opções (separadas por vírgula) pra um campo de seleção." };
  }

  await prisma.leadCampoPersonalizado.update({
    where: { id: campoId },
    data: {
      nome,
      tipo: tipo as "TEXTO" | "NUMERO" | "DATA" | "SELECAO",
      opcoes: tipo === "SELECAO" ? opcoes : null,
    },
  });

  redirect("/admin/crm/campos");
}

// Sem bloqueio por "tem valor preenchido" (diferente de excluirEtapaAction):
// campo personalizado é só um dado extra, não estrutural — apagar a
// definição junto com os valores (onDelete: Cascade) não deixa nada quebrado.
export async function excluirCampoAction(campoId: string) {
  await requireAdminSession();
  await prisma.leadCampoPersonalizado.delete({ where: { id: campoId } });
  redirect("/admin/crm/campos");
}

// Salva todos os campos personalizados de um lead de uma vez só (um form,
// um botão "Salvar" — mais simples que um botão por campo pro volume baixo
// de leads/campos deste CRM). formData vem com uma chave `campo_<id>` por
// campo cadastrado; upsert por (leadId, campoId).
export async function salvarCamposLeadAction(
  leadId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  await requireAdminSession();
  const campos = await prisma.leadCampoPersonalizado.findMany();

  await Promise.all(
    campos.map((campo) => {
      const valor = String(formData.get(`campo_${campo.id}`) ?? "").trim();
      return prisma.leadCampoValor.upsert({
        where: { leadId_campoId: { leadId, campoId: campo.id } },
        create: { leadId, campoId: campo.id, valor },
        update: { valor },
      });
    })
  );

  redirect(`/admin/crm/${leadId}`);
}
