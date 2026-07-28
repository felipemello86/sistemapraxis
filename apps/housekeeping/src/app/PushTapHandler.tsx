"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolverDestinoNotificacao } from "@/lib/pushDestino";

// Trata o toque em uma notificação push ENQUANTO o app já está rodando
// dentro do Housekeeping (webview já carregado neste basePath /governance).
// Complementa apps/gateway/src/app/[cliente]/PushRegistration.tsx, que trata
// o mesmo evento no hub (cold start do app sempre abre lá, ver server.url em
// apps/mobile-app/capacitor.config.ts) — precisa dos dois porque a
// navegação entre gateway e módulos é full-page (cross-app), destruindo e
// recriando o contexto JS, então o listener só existe em quem estiver
// carregado no momento do tap. apps/maintenance tem seu próprio
// PushTapHandler idêntico a este, pro mesmo motivo.
//
// resolverDestinoNotificacao (lib/pushDestino.ts) traduz o `data` da
// notificação pro par {modulo, caminho} — antes disso só existia deep link
// pra "fim_dia", pedido explícito do Felipe pra cobrir todos os tipos.
//
// Se o destino é DENTRO do Housekeeping (modulo="governance"), router.push
// basta — já estamos no app certo, o Router do Next aplica o basePath
// "/governance" sozinho. Se o destino é OUTRO módulo (ex.: Manutenção),
// precisa navegação cross-app de verdade (full-page), daí window.location —
// exige tenantSlug (prop, vem da sessão lida no layout.tsx raiz) e a URL
// pública do gateway.
export default function PushTapHandler({ tenantSlug }: { tenantSlug?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).Capacitor) return;
    let listenerHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import("@capacitor/push-notifications");
        listenerHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (acao) => {
          const destino = resolverDestinoNotificacao(acao.notification.data as Record<string, string> | undefined);
          if (!destino) return;

          if (destino.modulo === "governance") {
            router.push(destino.caminho);
            return;
          }

          if (tenantSlug) {
            const base = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br";
            window.location.href = `${base}/${tenantSlug}/${destino.modulo}${destino.caminho}`;
          }
        });
      } catch {
        // best-effort — se o plugin não carregar (ex: fora do app nativo),
        // simplesmente não há deep link, sem quebrar o resto da tela.
      }
    })();

    return () => {
      listenerHandle?.remove();
    };
  }, [router, tenantSlug]);

  return null;
}
