"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  getSession,
  hasModuleAccess,
  cifrarToken,
  trocarCodePorToken,
  inscreverWebhookWaba,
  buscarInfoNumero,
  registrarNumero,
  gerarPinAleatorio,
} from "@praxis/core";

export type ConectarWhatsAppResult = { ok: true } | { ok: false; erro: string };

// Recebe o `code` + waba_id + phone_number_id que o popup de Embedded
// Signup devolveu no client (ver ConectarWhatsAppButton.tsx — code vem do
// callback do FB.login(), waba_id/phone_number_id vêm do listener de
// `message` separado) e faz toda a troca/registro do lado do servidor —
// nunca do client, conforme documentação oficial da Meta.
export async function conectarWhatsAppAction(
  tenantSlug: string,
  code: string,
  wabaId: string,
  phoneNumberId: string
): Promise<ConectarWhatsAppResult> {
  const session = await getSession();
  if (!session) return { ok: false, erro: "Não autenticado." };
  const pode = await hasModuleAccess(session, "SALES");
  if (!pode) return { ok: false, erro: "Sem acesso ao módulo Vendas." };

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return { ok: false, erro: "Integração não configurada (faltam NEXT_PUBLIC_FACEBOOK_APP_ID/FACEBOOK_APP_SECRET)." };
  }

  const troca = await trocarCodePorToken(appId, appSecret, code);
  if (!troca.ok) return { ok: false, erro: `Falha ao trocar código por token: ${troca.erro}` };
  const token = troca.data.access_token;

  const inscricao = await inscreverWebhookWaba(token, wabaId);
  if (!inscricao.ok) return { ok: false, erro: `Falha ao inscrever webhook: ${inscricao.erro}` };

  const pin = gerarPinAleatorio();
  const registro = await registrarNumero(token, phoneNumberId, pin);
  if (!registro.ok) {
    // Não bloqueia a conexão por isso — em alguns casos o número já vem
    // registrado pelo próprio fluxo de Embedded Signup (ex: migração de
    // número já ativo). Guarda o erro só como diagnóstico.
    console.error(`Falha ao registrar phoneNumberId ${phoneNumberId}: ${registro.erro}`);
  }

  const info = await buscarInfoNumero(token, phoneNumberId);

  await prisma.channelConnection.upsert({
    where: { tenantId_provider: { tenantId: session.tenantId, provider: "WHATSAPP" } },
    create: {
      tenantId: session.tenantId,
      provider: "WHATSAPP",
      status: "CONECTADO",
      wabaId,
      phoneNumberId,
      displayPhoneNumber: info.ok ? info.data.display_phone_number : null,
      verifiedName: info.ok ? info.data.verified_name : null,
      accessTokenCifrado: cifrarToken(token),
    },
    update: {
      status: "CONECTADO",
      erro: null,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: info.ok ? info.data.display_phone_number : null,
      verifiedName: info.ok ? info.data.verified_name : null,
      accessTokenCifrado: cifrarToken(token),
    },
  });

  revalidatePath(`/${tenantSlug}/vendas/canais`);
  return { ok: true };
}

export async function desconectarWhatsAppAction(tenantSlug: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const pode = await hasModuleAccess(session, "SALES");
  if (!pode) return;

  await prisma.channelConnection
    .delete({ where: { tenantId_provider: { tenantId: session.tenantId, provider: "WHATSAPP" } } })
    .catch(() => {});
  revalidatePath(`/${tenantSlug}/vendas/canais`);
}
