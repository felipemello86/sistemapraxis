"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { telefoneValido, formatarTelefoneExibicao } from "../../admin/crm/telefone";

// Módulo Vendas do tenant (06/08/2026) — mesmo padrão de segurança de todo
// módulo da suíte (ver [cliente]/inteligencia/actions.ts): o tenant vem
// SEMPRE da sessão (session.tenantId), nunca do :cliente da URL — assim uma
// sessão de um tenant não consegue mexer nos leads de outro só editando a
// URL. tenantSlug é passado à parte, só pra montar o path de
// revalidatePath/redirect (Server Action não sabe em qual rota foi
// chamada).

export type VendasActionResult = { ok: true } | { ok: false; error: string };

async function requireAccess() {
  const session = await getSession();
  if (!session) throw new Error("Não autenticado.");
  const pode = await hasModuleAccess(session, "SALES");
  if (!pode) throw new Error("Sem acesso ao módulo Vendas.");
  return session;
}

// Confere que o lead pertence mesmo ao tenant da sessão antes de qualquer
// leitura/escrita — mesma função de guarda usada em getInsightOrThrow
// (inteligencia/actions.ts), adaptada pro VendasLead.
async function getLeadOrThrow(leadId: string, tenantId: string) {
  const lead = await prisma.vendasLead.findUnique({ where: { id: leadId } });
  if (!lead || lead.tenantId !== tenantId) throw new Error("Lead não encontrado.");
  return lead;
}

export async function moverEtapaAction(tenantSlug: string, leadId: string, novaEtapaId: string) {
  const session = await requireAccess();
  const [lead, novaEtapa] = await Promise.all([
    getLeadOrThrow(leadId, session.tenantId),
    prisma.vendasEtapa.findUnique({ where: { id: novaEtapaId } }),
  ]);
  if (!novaEtapa || novaEtapa.tenantId !== session.tenantId) return;

  await prisma.$transaction([
    prisma.vendasLead.update({ where: { id: leadId }, data: { stageId: novaEtapa.id } }),
    prisma.vendasAtividade.create({
      data: { leadId, tipo: "MUDANCA_ETAPA", conteudo: `→ ${novaEtapa.nome}`, autorNome: session.nome },
    }),
  ]);
  revalidatePath(`/${tenantSlug}/vendas`);
  revalidatePath(`/${tenantSlug}/vendas/${leadId}`);
}

async function marcarDesfecho(
  session: Awaited<ReturnType<typeof requireAccess>>,
  leadId: string,
  desfecho: "GANHO" | "PERDIDO" | "ABERTO",
  opts?: { motivoPerda?: string | null; sufixoLog?: string }
) {
  await getLeadOrThrow(leadId, session.tenantId);
  await prisma.$transaction([
    prisma.vendasLead.update({
      where: { id: leadId },
      data: { desfecho, motivoPerda: desfecho === "PERDIDO" ? opts?.motivoPerda ?? null : null },
    }),
    prisma.vendasAtividade.create({
      data: { leadId, tipo: "MUDANCA_ETAPA", conteudo: `Desfecho: ${desfecho}${opts?.sufixoLog ?? ""}`, autorNome: session.nome },
    }),
  ]);
}

export async function marcarGanhoAction(tenantSlug: string, leadId: string) {
  const session = await requireAccess();
  await marcarDesfecho(session, leadId, "GANHO", { sufixoLog: " 🎉" });
  revalidatePath(`/${tenantSlug}/vendas`);
  revalidatePath(`/${tenantSlug}/vendas/${leadId}`);
}

export async function marcarPerdidoRapidoAction(tenantSlug: string, leadId: string, motivo: string) {
  const session = await requireAccess();
  const motivoFinal = motivo.trim() || "Não informado";
  await marcarDesfecho(session, leadId, "PERDIDO", { motivoPerda: motivoFinal, sufixoLog: ` (${motivoFinal})` });
  revalidatePath(`/${tenantSlug}/vendas`);
  revalidatePath(`/${tenantSlug}/vendas/${leadId}`);
}

export async function reabrirLeadAction(tenantSlug: string, leadId: string) {
  const session = await requireAccess();
  await marcarDesfecho(session, leadId, "ABERTO", { sufixoLog: " (reaberto)" });
  revalidatePath(`/${tenantSlug}/vendas`);
  revalidatePath(`/${tenantSlug}/vendas/${leadId}`);
}

export async function excluirLeadAction(tenantSlug: string, leadId: string) {
  const session = await requireAccess();
  await getLeadOrThrow(leadId, session.tenantId);
  await prisma.vendasLead.delete({ where: { id: leadId } }).catch(() => {});
  // Redirect (não revalidatePath): diferente das outras ações daqui, essa
  // pode ser chamada de dentro da própria tela de detalhe do lead (ver
  // [leadId]/page.tsx) — depois de excluído não tem mais o que mostrar
  // lá, precisa navegar de volta pro board. O board (KanbanBoard.tsx) já
  // remove o card da UI otimisticamente antes de chamar essa action, então
  // esse redirect não atrapalha quando chamado de lá.
  redirect(`/${tenantSlug}/vendas`);
}

// Atualiza campos simples do lead a partir da tela de detalhe — cada um é
// um <form> próprio (ver [leadId]/page.tsx), sem client state: o próprio
// Next.js re-renderiza a rota atual com dado fresco depois do submit.
export async function atualizarValorAction(tenantSlug: string, leadId: string, valorStr: string) {
  const session = await requireAccess();
  await getLeadOrThrow(leadId, session.tenantId);
  const valor = Number(valorStr.replace(",", "."));
  if (!Number.isFinite(valor) || valor < 0) return;
  await prisma.vendasLead.update({ where: { id: leadId }, data: { valor } });
  revalidatePath(`/${tenantSlug}/vendas/${leadId}`);
}

export async function atualizarFonteAction(tenantSlug: string, leadId: string, fonte: string) {
  const session = await requireAccess();
  await getLeadOrThrow(leadId, session.tenantId);
  if (!fonte.trim()) return;
  await prisma.vendasLead.update({ where: { id: leadId }, data: { fonte: fonte.trim() } });
  revalidatePath(`/${tenantSlug}/vendas/${leadId}`);
}

export async function atualizarTelefoneAction(tenantSlug: string, leadId: string, telefone: string) {
  const session = await requireAccess();
  await getLeadOrThrow(leadId, session.tenantId);
  if (!telefoneValido(telefone)) return;
  await prisma.vendasLead.update({ where: { id: leadId }, data: { telefone: formatarTelefoneExibicao(telefone) } });
  revalidatePath(`/${tenantSlug}/vendas/${leadId}`);
}

// Cria um lead manualmente (botão "+ Novo lead" do board). Mesma validação
// de telefone do CRM do admin (criarLeadManualAction) — obrigatório e no
// formato compatível com WhatsApp, pra quando o módulo ganhar a integração
// (fase seguinte, ainda não construída aqui).
export async function criarLeadManualAction(
  tenantSlug: string,
  _prevState: VendasActionResult | null,
  formData: FormData
): Promise<VendasActionResult> {
  const session = await requireAccess();

  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120);
  const empresa = String(formData.get("empresa") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 160);
  const telefone = String(formData.get("telefone") ?? "").trim().slice(0, 40);
  const mensagem = String(formData.get("mensagem") ?? "").trim().slice(0, 2000);
  const fonte = String(formData.get("fonte") ?? "").trim().slice(0, 60);
  const valorStr = String(formData.get("valor") ?? "").replace(",", ".").trim();
  const valor = valorStr ? Number(valorStr) : 0;

  if (!nome || !telefone) {
    return { ok: false, error: "Preencha nome e telefone." };
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
  if (!telefoneValido(telefone)) {
    return { ok: false, error: "Telefone incompleto — inclua DDD e número (ex: (81) 98952-6361)." };
  }
  const telefoneFormatado = formatarTelefoneExibicao(telefone);

  const primeiraEtapa = await prisma.vendasEtapa.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { ordem: "asc" },
  });

  const lead = await prisma.vendasLead.create({
    data: {
      tenantId: session.tenantId,
      nome,
      empresa: empresa || null,
      email: email || null,
      telefone: telefoneFormatado,
      mensagem: mensagem || null,
      fonte,
      valor,
      stageId: primeiraEtapa?.id,
    },
  });

  await prisma.vendasAtividade.create({
    data: { leadId: lead.id, tipo: "NOTA", conteudo: "Lead criado manualmente.", autorNome: session.nome },
  });

  redirect(`/${tenantSlug}/vendas`);
}
