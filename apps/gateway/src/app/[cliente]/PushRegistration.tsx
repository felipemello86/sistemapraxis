"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Monta silenciosamente (sem UI, `return null`) no hub do cliente
// ([cliente]/page.tsx), que é a primeira tela que o app nativo (Capacitor)
// abre — ver server.url em apps/mobile-app/capacitor.config.ts. Registra o
// token de push (FCM) do aparelho pro usuário logado, chamando
// POST /api/push/register (rota deste mesmo app gateway).
//
// Não existia no v1 — o utilitário de envio (sendPushToUser) e o endpoint
// de registro foram construídos lá, mas nunca ligados a nenhum código
// client-side que de fato pedisse permissão/token ao SO. Essa é a peça que
// faltava.
//
// BUG ENCONTRADO EM PRODUÇÃO (21/07): a tabela PushToken estava zerada,
// sempre — o registro nunca completava. Causa nº1 corrigida: os tiles do
// hub eram <a href> puros (ModuleTile.tsx), e um clique disparava
// navegação de DOCUMENTO completa (cross-app, não é SPA), destruindo o
// contexto JS no meio da cadeia de awaits abaixo.
//
// Depois desse fix, MESMO parado na tela do hub (sem navegar pra lugar
// nenhum), o diálogo de permissão nativo continuou nunca aparecendo — nem
// em instalação 100% limpa (uninstall manual + reinstall). Ou seja, tem
// uma segunda causa, ainda não identificada, que impede a cadeia de sequer
// chegar em requestPermissions(). Os `console.log` com prefixo
// "[PRAXIS-PUSH]" abaixo existem só pra depuração ao vivo via Logcat
// (filtro "PRAXIS-PUSH") — podem ser removidos depois que o fluxo for
// confirmado funcionando de ponta a ponta.
let resolveSettled: () => void = () => {};

export const pushRegistrationSettled: Promise<void> = new Promise((resolve) => {
  resolveSettled = resolve;
});

const TIMEOUT_MS = 5000;

const LOG = (...args: unknown[]) => console.log("[PRAXIS-PUSH]", ...args);

export default function PushRegistration() {
  const params = useParams<{ cliente: string }>();
  const router = useRouter();

  // Trata o toque em notificação quando o app abre "a frio" (cold start) —
  // o server.url do Capacitor sempre carrega o hub do tenant primeiro (ver
  // apps/mobile-app/capacitor.config.ts), então é aqui que o tap chega
  // quando o app estava fechado/em background sem nenhum outro módulo já
  // carregado. Se o Housekeeping já estiver aberto no momento do tap, quem
  // trata é apps/housekeeping/src/app/PushTapHandler.tsx — precisa dos
  // dois porque a navegação entre gateway e módulos é full-page (cross-app,
  // recria o contexto JS a cada troca).
  //
  // Único tipo com deep link hoje: "fim_dia" (ver api/finalizacao-dia),
  // leva pra Relatórios do Housekeeping.
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).Capacitor) return;
    let listenerHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import("@capacitor/push-notifications");
        listenerHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (acao) => {
          const tipo = acao.notification.data?.tipo;
          if (tipo === "fim_dia" && params?.cliente) {
            router.push(`/${params.cliente}/governance/relatorios`);
          }
        });
      } catch {
        // best-effort — sem deep link se o plugin não carregar.
      }
    })();

    return () => {
      listenerHandle?.remove();
    };
  }, [params?.cliente, router]);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    function settle(motivo: string) {
      LOG("settle():", motivo);
      if (settled) return;
      settled = true;
      resolveSettled();
    }
    // Nunca segura a navegação por mais que isso, mesmo se o FCM demorar
    // ou travar por algum motivo.
    const timeoutId = setTimeout(() => settle("timeout de 5s atingido"), TIMEOUT_MS);

    LOG("useEffect montado");

    (async () => {
      try {
        LOG("verificando window.Capacitor:", typeof window !== "undefined" && !!(window as any).Capacitor);

        if (typeof window === "undefined" || !(window as any).Capacitor) {
          settle("window.Capacitor ausente (não é app nativo / navegador comum)");
          return;
        }

        LOG("importando @capacitor/core...");
        const { Capacitor } = await import("@capacitor/core");
        LOG("Capacitor.isNativePlatform():", Capacitor.isNativePlatform(), "| getPlatform():", Capacitor.getPlatform());

        if (!Capacitor.isNativePlatform()) {
          settle("isNativePlatform() = false");
          return;
        }

        LOG("importando @capacitor/push-notifications...");
        const { PushNotifications } = await import("@capacitor/push-notifications");
        LOG("plugin carregado, chamando checkPermissions()...");

        const atual = await PushNotifications.checkPermissions();
        LOG("checkPermissions() retornou:", JSON.stringify(atual));

        let concedida = atual.receive === "granted";
        if (!concedida && atual.receive !== "denied") {
          LOG("permissão ainda não decidida, chamando requestPermissions() — diálogo deveria aparecer agora...");
          const pedido = await PushNotifications.requestPermissions();
          LOG("requestPermissions() retornou:", JSON.stringify(pedido));
          concedida = pedido.receive === "granted";
        }

        if (!concedida || cancelled) {
          settle(`permissão não concedida (concedida=${concedida}, cancelled=${cancelled})`);
          return;
        }

        LOG("permissão concedida, registrando listeners e chamando register()...");

        PushNotifications.addListener("registration", async (token) => {
          LOG("evento 'registration' recebido, token:", token.value.slice(0, 12) + "...");
          try {
            const res = await fetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
            });
            LOG("POST /api/push/register status:", res.status);
          } catch (err) {
            LOG("erro no fetch de /api/push/register:", String(err));
          } finally {
            settle("token registrado (ou tentativa de POST concluída)");
          }
        });

        PushNotifications.addListener("registrationError", (err) => {
          LOG("evento 'registrationError':", JSON.stringify(err));
          settle("registrationError");
        });

        await PushNotifications.register();
        LOG("register() chamado com sucesso, aguardando evento 'registration'...");
      } catch (err) {
        LOG("ERRO inesperado na cadeia:", err instanceof Error ? err.message : String(err));
        settle("exceção capturada");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
