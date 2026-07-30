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
import { normalizarTelefone, telefoneValido, formatarTelefoneExibicao } from "./crm/telefone";
import { enviarMensagemWhatsApp } from "./crm/whatsapp";

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

  redirect("/admin/clientes");
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

  redirect("/admin/planos");
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

  redirect("/admin/planos");
}

// "Excluir" é soft-delete (ativo: false) em vez de apagar a linha — planos já
// referenciados por uma TenantSubscription (planId) não podem ser apagados de
// verdade sem quebrar a FK, e mesmo os que não têm assinatura nenhuma ainda
// ficam mais seguros assim: histórico preservado, só sai da lista de planos
// ativos/selecionáveis.
export async function excluirPlanoAction(planId: string) {
  await requireAdminSession();
  await prisma.subscriptionPlan.update({ where: { id: planId }, data: { ativo: false } });
  redirect("/admin/planos");
}

// ═══════════════════════════════════════════════════════════════════════════
// CRM (Fase 1, 30/07/2026) — funil de vendas dos leads da landing page.
// Ver PipelineStage/DemoLead/LeadActivity em schema.prisma. Substitui o
// antigo alternarLeadAtendidoAction (flag binária "atendido") por um funil
// com etapas de verdade + linha do tempo de atividades.
// ═══════════════════════════════════════════════════════════════════════════

// Move um lead pra outra etapa do funil — troca rápida pelo drag-and-drop do
// board (ver KanbanBoard.tsx). Puramente sobre a coluna (stageId); não mexe
// em desfecho (ganho/perdido é independente da etapa, ver marcarGanhoAction
// /marcarPerdidoRapidoAction/reabrirLeadAction abaixo).
async function moverEtapa(autorNome: string, leadId: string, novaEtapaId: string): Promise<void> {
  const [lead, novaEtapa] = await Promise.all([
    prisma.demoLead.findUnique({ where: { id: leadId }, include: { stage: true } }),
    prisma.pipelineStage.findUnique({ where: { id: novaEtapaId } }),
  ]);
  if (!lead || !novaEtapa) return;

  await prisma.$transaction([
    prisma.demoLead.update({ where: { id: leadId }, data: { stageId: novaEtapa.id } }),
    prisma.leadActivity.create({
      data: {
        leadId,
        tipo: "MUDANCA_ETAPA",
        conteudo: `${lead.stage ? lead.stage.nome + " → " : "→ "}${novaEtapa.nome}`,
        autorNome,
      },
    }),
  ]);
}

export async function moverEtapaAction(leadId: string, novaEtapaId: string) {
  const admin = await requireAdminSession();
  await moverEtapa(admin.nome, leadId, novaEtapaId);
  redirect("/admin/crm");
}

// Mesma lógica de moverEtapaAction, mas chamada de dentro da tela de
// detalhe do lead — redireciona de volta pra lá em vez de pro board.
export async function moverEtapaDetalheAction(leadId: string, novaEtapaId: string) {
  const admin = await requireAdminSession();
  await moverEtapa(admin.nome, leadId, novaEtapaId);
  redirect(`/admin/crm/${leadId}`);
}

// Núcleo compartilhado de marcar um desfecho (ganho/perdido/reabrir) —
// 30/07/2026: desfecho é independente da etapa (pedido do Felipe: "as
// perdas ou ganhos devem poder existir em qualquer coluna"), então isso só
// atualiza DemoLead.desfecho + motivoPerda, nunca stageId. O lead continua
// na mesma coluna; o board (KanbanBoard.tsx) que decide escondê-lo da
// coluna normal e mostrá-lo na área recolhível de "Finalizados".
async function marcarDesfecho(
  autorNome: string,
  leadId: string,
  desfecho: "GANHO" | "PERDIDO" | "ABERTO",
  opts?: { motivoPerda?: string | null; sufixoLog?: string }
): Promise<void> {
  await prisma.$transaction([
    prisma.demoLead.update({
      where: { id: leadId },
      data: { desfecho, motivoPerda: desfecho === "PERDIDO" ? opts?.motivoPerda ?? null : null },
    }),
    prisma.leadActivity.create({
      data: {
        leadId,
        tipo: "MUDANCA_ETAPA",
        conteudo: `Desfecho: ${desfecho}${opts?.sufixoLog ?? ""}`,
        autorNome,
      },
    }),
  ]);
}

// Marca o lead como perdido a partir da tela de detalhe — exige um motivo,
// registrado tanto em DemoLead.motivoPerda (aparece destacado no card)
// quanto na linha do tempo.
export async function marcarPerdidoAction(
  leadId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await requireAdminSession();
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) return { ok: false, error: "Descreva o motivo da perda." };

  await marcarDesfecho(admin.nome, leadId, "PERDIDO", { motivoPerda: motivo, sufixoLog: ` (${motivo})` });
  redirect(`/admin/crm/${leadId}`);
}

// Atalho do board (botão ✅) e da tela de detalhe: marca o lead como ganho
// sem mudar de coluna.
export async function marcarGanhoAction(leadId: string) {
  const admin = await requireAdminSession();
  await marcarDesfecho(admin.nome, leadId, "GANHO", { sufixoLog: " 🎉" });
  redirect("/admin/crm");
}

// Mesma lógica de marcarGanhoAction, mas chamada de dentro da tela de
// detalhe — redireciona de volta pra lá.
export async function marcarGanhoDetalheAction(leadId: string) {
  const admin = await requireAdminSession();
  await marcarDesfecho(admin.nome, leadId, "GANHO", { sufixoLog: " 🎉" });
  redirect(`/admin/crm/${leadId}`);
}

// Atalho do board (botão ❌): marca o lead como perdido direto do card, sem
// mudar de coluna. O motivo vem de um prompt() simples no client (ver
// KanbanBoard.tsx) em vez do form da tela de detalhe — por isso aceita
// string solta em vez de FormData, e cai pra "Não informado" se vier vazio
// (motivo continua editável depois, abrindo o lead e reeditando).
export async function marcarPerdidoRapidoAction(leadId: string, motivo: string) {
  const admin = await requireAdminSession();
  const motivoFinal = motivo.trim() || "Não informado";
  await marcarDesfecho(admin.nome, leadId, "PERDIDO", { motivoPerda: motivoFinal, sufixoLog: ` (${motivoFinal})` });
  redirect("/admin/crm");
}

// Desfaz um desfecho (ganho ou perdido) — volta o lead pra "ABERTO",
// limpando motivoPerda, sem mexer na etapa/coluna atual. Usado tanto na área
// de "Finalizados" do board quanto na tela de detalhe.
export async function reabrirLeadAction(leadId: string) {
  const admin = await requireAdminSession();
  await marcarDesfecho(admin.nome, leadId, "ABERTO", { sufixoLog: " (reaberto)" });
  redirect("/admin/crm");
}

export async function reabrirLeadDetalheAction(leadId: string) {
  const admin = await requireAdminSession();
  await marcarDesfecho(admin.nome, leadId, "ABERTO", { sufixoLog: " (reaberto)" });
  redirect(`/admin/crm/${leadId}`);
}

// CRM Fase 2 (30/07/2026) — envia uma mensagem de WhatsApp pro lead via
// Cloud API (ver ./crm/whatsapp.ts). Deliberadamente NÃO termina em
// redirect() como as outras actions desta tela: é chamada de dentro de um
// painel de chat (WhatsAppChat.tsx) que precisa do resultado (sucesso/erro)
// na hora, sem recarregar a página inteira a cada mensagem enviada.
export async function enviarMensagemWhatsAppAction(leadId: string, texto: string): Promise<AdminActionResult> {
  await requireAdminSession();
  const textoLimpo = texto.trim();
  if (!textoLimpo) return { ok: false, error: "Mensagem vazia." };

  const lead = await prisma.demoLead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  if (!lead.telefone) return { ok: false, error: "Este lead não tem telefone cadastrado." };

  const telefoneDigits = normalizarTelefone(lead.telefone);
  const resultado = await enviarMensagemWhatsApp(telefoneDigits, textoLimpo);
  if (!resultado.ok) return { ok: false, error: resultado.erro };

  await prisma.whatsAppMensagem.create({
    data: {
      leadId,
      direcao: "ENVIADA",
      conteudo: textoLimpo,
      tipo: "texto",
      waMessageId: resultado.waMessageId,
      status: "ENVIADA",
    },
  });

  return { ok: true };
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

// Exclui o lead de vez — hard delete mesmo (não soft-delete como os planos):
// diferente de um plano, que pode estar referenciado por uma assinatura
// ativa, um lead não tem nada dependendo dele fora do próprio CRM.
// LeadActivity e LeadCampoValor têm onDelete: Cascade no schema, então o
// histórico e os campos personalizados desse lead somem junto — intencional,
// já que "excluir o lead" deveria mesmo apagar tudo dele.
export async function excluirLeadAction(leadId: string) {
  await requireAdminSession();
  await prisma.demoLead.delete({ where: { id: leadId } }).catch(() => {});
  redirect("/admin/crm");
}

// Atualiza a fonte do lead (de onde ele veio) — campo obrigatório, mas
// editável depois caso alguém escolha errado na hora de criar manualmente.
// Sem opção "vazio": se vier string vazia, simplesmente não atualiza (evita
// um lead ficar sem fonte por um clique acidental num <select> parcialmente
// carregado).
export async function atualizarFonteAction(leadId: string, fonte: string) {
  await requireAdminSession();
  if (!fonte.trim()) redirect(`/admin/crm/${leadId}`);
  await prisma.demoLead.update({ where: { id: leadId }, data: { fonte: fonte.trim() } });
  redirect(`/admin/crm/${leadId}`);
}

// Corrige o telefone de um lead já criado (30/07/2026, pedido do Felipe) —
// mesma validação de criarLeadManualAction: sem DDD+número completo, a
// integração de WhatsApp quebra (envio falha, mensagem recebida não casa
// com o lead). Silenciosamente ignora se inválido em vez de travar a tela
// com erro — ValorInput/FonteSelect seguem o mesmo padrão de "sem <form>",
// então não tem onde exibir uma mensagem de erro aqui; a validação real que
// importa é a de criarLeadManualAction (que bloqueia a criação).
export async function atualizarTelefoneAction(leadId: string, telefone: string) {
  await requireAdminSession();
  if (!telefoneValido(telefone)) redirect(`/admin/crm/${leadId}`);
  await prisma.demoLead.update({ where: { id: leadId }, data: { telefone: formatarTelefoneExibicao(telefone) } });
  redirect(`/admin/crm/${leadId}`);
}

// Atualiza o "Valor (R$)" do negócio a partir da tela de detalhe (ver
// ValorInput.tsx) — mesmo padrão de atualizarFonteAction. Aceita string
// solta (vem de um <input type="number">) em vez de FormData porque é
// chamado direto no onBlur do input, sem <form>. Vírgula ou ponto como
// separador decimal, negativo/lixo vira 0 em vez de quebrar.
export async function atualizarValorAction(leadId: string, valorStr: string) {
  await requireAdminSession();
  const normalizado = valorStr.replace(",", ".").trim();
  const valor = Number(normalizado);
  await prisma.demoLead.update({
    where: { id: leadId },
    data: { valor: Number.isFinite(valor) && valor >= 0 ? valor : 0 },
  });
  redirect(`/admin/crm/${leadId}`);
}

// Cria um lead direto no CRM, sem passar pelo formulário público da landing
// page — pra contatos que chegaram por telefone, indicação, evento etc.
// E-mail é opcional aqui (diferente do POST /api/demo) porque nem sempre dá
// pra saber o e-mail de quem ligou; entra em branco e pode ser completado
// depois. Já registra uma primeira nota na linha do tempo pra distinguir de
// um lead que veio do site. "fonte" é obrigatório (pedido do Felipe,
// 30/07/2026) — diferente do POST /api/demo, que sempre grava "Site"
// automaticamente, aqui quem cria escolhe, já que passou por fora do site.
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
  const fonte = String(formData.get("fonte") ?? "").trim().slice(0, 60);
  const valorStr = String(formData.get("valor") ?? "").replace(",", ".").trim();
  const valor = valorStr ? Number(valorStr) : 0;

  if (!nome || !hotel || !telefone) {
    return { ok: false, error: "Preencha nome, hotel e telefone." };
  }
  if (!fonte) {
    return { ok: false, error: "Selecione a fonte do lead." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "E-mail inválido (ou deixe em branco)." };
  }
  if (!Number.isFinite(valor) || valor < 0) {
    return { ok: false, error: "Valor (R$) inválido." };
  }
  // Telefone precisa estar completo (DDD + número) pra integração de
  // WhatsApp funcionar — sem isso, o envio falha e mensagens recebidas não
  // casam com o lead certo (ver ./crm/data.ts,
  // encontrarOuCriarLeadPorTelefone). Grava já formatado/normalizado, não
  // do jeito solto que a pessoa digitou.
  if (!telefoneValido(telefone)) {
    return { ok: false, error: "Telefone incompleto — inclua DDD e número (ex: (81) 98952-6361)." };
  }
  const telefoneFormatado = formatarTelefoneExibicao(telefone);

  const primeiraEtapa = await prisma.pipelineStage.findFirst({ orderBy: { ordem: "asc" } });

  const lead = await prisma.demoLead.create({
    data: { nome, hotel, email, telefone: telefoneFormatado, mensagem: mensagem || null, fonte, valor, stageId: primeiraEtapa?.id },
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
  if (!nome) return { ok: false, error: "Dê um nome pra etapa." };

  const ultima = await prisma.pipelineStage.findFirst({ orderBy: { ordem: "desc" } });
  await prisma.pipelineStage.create({
    data: { nome, ordem: (ultima?.ordem ?? -1) + 1 },
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
  if (!nome) return { ok: false, error: "Dê um nome pra etapa." };

  await prisma.pipelineStage.update({ where: { id: stageId }, data: { nome } });
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
