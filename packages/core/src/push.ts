import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "./prisma";

// Portado de apps/housekeeping/src/lib/push.ts (v1) — mesma lógica, agora
// compartilhada em @praxis/core porque o model PushToken vive no schema
// suite_core (User é único pra toda a suíte) e mais de um app (Governança,
// Manutenção, Avaliações) pode querer mandar push no futuro.
//
// Um único provedor (Firebase Cloud Messaging) cobre Android nativamente e
// iOS por baixo dos panos via APNs.
//
// Credencial: gerar em Firebase Console → Configurações do projeto → Contas
// de serviço → "Gerar nova chave privada" (baixa um JSON). Colar o conteúdo
// inteiro desse JSON (sem quebras de linha extras) na env var
// FIREBASE_SERVICE_ACCOUNT_JSON, em todo app que for chamar sendPushToUser
// (hoje: apps/housekeeping) — reusa o mesmo projeto Firebase "praxis-hotels"
// do v1, não precisa criar um novo.
function getFirebaseApp(): App | null {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return initializeApp({ credential: cert(serviceAccount) });
}

interface PushPayload {
  title: string;
  body: string;
  /** Usado pro app decidir pra onde navegar ao tocar na notificação. */
  data?: Record<string, string>;
}

/**
 * Manda push pra todos os aparelhos registrados de um usuário. Melhor
 * esforço: nunca lança erro (try/catch cobre tudo, inclusive se push não
 * estiver configurado — FIREBASE_SERVICE_ACCOUNT_JSON ausente — ou se o
 * usuário não tiver nenhum token). Por isso é seguro (e OBRIGATÓRIO) chamar
 * com `await` nos pontos de notificação (nova atribuição, liberação de UH,
 * etc.) mesmo sem querer bloquear o fluxo em caso de falha: em serverless
 * (Vercel), uma chamada "fire and forget" (`void sendPushToUser(...)`) sem
 * await pode ser interrompida no meio quando a function congela logo após a
 * resposta ser enviada — a notificação nunca chega, sem nenhum log de erro.
 * Isso foi um bug real em produção (ver git log): `await` aqui garante que a
 * function só encerra depois que o envio (ou a falha) realmente aconteceu.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const app = getFirebaseApp();
    if (!app) {
      console.warn("[push] FIREBASE_SERVICE_ACCOUNT_JSON não configurado — envio ignorado");
      return;
    }

    const tokens = await prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (tokens.length === 0) return;

    const response = await getMessaging(app).sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      // BUG ENCONTRADO EM PRODUÇÃO (22/07): banner aparecia mas sem som.
      // O campo genérico `notification` não inclui som — no iOS, o APNs só
      // toca som se `aps.sound` vier explícito no payload; sem isso, fica
      // mudo mesmo com presentationOptions permitindo som (ver
      // capacitor.config.json). "default" usa o som padrão do sistema.
      apns: {
        payload: {
          aps: { sound: "default" },
        },
      },
      android: {
        notification: { sound: "default" },
      },
    });

    // Token deixa de ser válido quando o usuário desinstala o app ou o SO
    // revoga (comum em iOS). Limpa esses aqui em vez de deixar acumular lixo
    // e tentar reenviar pra token morto pra sempre.
    const deadTokens = response.responses
      .map((r, i) => (!r.success && isDeadTokenError(r.error?.code) ? tokens[i].token : null))
      .filter((t): t is string => t !== null);

    if (deadTokens.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: deadTokens } } });
    }

    console.log(`[push] enviado pra userId=${userId}: ${response.successCount}/${tokens.length} sucesso`);
    return response;
  } catch (err) {
    console.error("[push] erro ao enviar:", err);
    return undefined;
  }
}

function isDeadTokenError(code?: string): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-argument"
  );
}
