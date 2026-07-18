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
export default function PushRegistration() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Guard duplo antes de tocar em qualquer coisa do Capacitor: em
      // qualquer navegador comum (Safari, Chrome, preview no desktop) isso
      // não deve rodar nada — só dentro do app nativo, onde o shell injeta
      // window.Capacitor antes do JS da página carregar.
      if (typeof window === "undefined" || !(window as any).Capacitor) return;

      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { PushNotifications } = await import("@capacitor/push-notifications");

      const atual = await PushNotifications.checkPermissions();
      let concedida = atual.receive === "granted";
      if (!concedida && atual.receive !== "denied") {
        const pedido = await PushNotifications.requestPermissions();
        concedida = pedido.receive === "granted";
      }
      if (!concedida || cancelled) return;

      await PushNotifications.register();

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
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.warn("[push] erro ao registrar token", err);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
