"use client";
import { useEffect } from "react";

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
// sempre — o registro nunca completava. Causa: os tiles do hub são <a
// href> puros (ModuleTile.tsx), e um clique dispara navegação de DOCUMENTO
// completa (cross-app, não é SPA), o que destrói o contexto JS no meio da
// cadeia de awaits abaixo. Usuário com um só módulo é redirecionado quase
// instantaneamente — antes até do diálogo de permissão aparecer.
//
// Fix: expõe `pushRegistrationSettled`, uma promise que o ModuleTile espera
// antes de navegar (com timeout de segurança, pra nunca travar quem não usa
// push/não é nativo). `settle()` é chamado o quanto antes em cada saída
// antecipada (não-nativo, permissão negada) — só no caminho de sucesso ela
// espera o evento "registration" de verdade completar o POST antes de
// liberar a navegação.
let resolveSettled: () => void = () => {};

export const pushRegistrationSettled: Promise<void> = new Promise((resolve) => {
  resolveSettled = resolve;
});

const TIMEOUT_MS = 5000;

export default function PushRegistration() {
  useEffect(() => {
    let cancelled = false;
    let settled = false;
    function settle() {
      if (settled) return;
      settled = true;
      resolveSettled();
    }
    // Nunca segura a navegação por mais que isso, mesmo se o FCM demorar
    // ou travar por algum motivo.
    const timeoutId = setTimeout(settle, TIMEOUT_MS);

    (async () => {
      // Guard duplo antes de tocar em qualquer coisa do Capacitor: em
      // qualquer navegador comum (Safari, Chrome, preview no desktop) isso
      // não deve rodar nada — só dentro do app nativo, onde o shell injeta
      // window.Capacitor antes do JS da página carregar.
      if (typeof window === "undefined" || !(window as any).Capacitor) {
        settle();
        return;
      }

      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        settle();
        return;
      }

      const { PushNotifications } = await import("@capacitor/push-notifications");

      const atual = await PushNotifications.checkPermissions();
      let concedida = atual.receive === "granted";
      if (!concedida && atual.receive !== "denied") {
        const pedido = await PushNotifications.requestPermissions();
        concedida = pedido.receive === "granted";
      }
      if (!concedida || cancelled) {
        settle();
        return;
      }

      PushNotifications.addListener("registration", async (token) => {
        try {
          await fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
          });
        } catch {
          // Melhor esforço — se a rede falhar aqui, tenta de novo na
          // próxima vez que o app abrir (register() é idempotente).
        } finally {
          settle();
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.warn("[push] erro ao registrar token", err);
        settle();
      });

      // Não chama settle() aqui: register() só confirma que o pedido foi
      // feito ao SO — o token de verdade chega depois, assíncrono, via
      // listener "registration" (ou falha via "registrationError"). É o
      // listener quem libera a navegação.
      await PushNotifications.register();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
