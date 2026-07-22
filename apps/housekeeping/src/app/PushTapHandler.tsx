"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Trata o toque em uma notificação push ENQUANTO o app já está rodando
// dentro do Housekeeping (webview já carregado neste basePath /governance).
// Complementa apps/gateway/src/app/[cliente]/PushRegistration.tsx, que trata
// o mesmo evento no hub (cold start do app sempre abre lá, ver server.url em
// apps/mobile-app/capacitor.config.ts) — precisa dos dois porque a
// navegação entre gateway e módulos é full-page (cross-app), destruindo e
// recriando o contexto JS, então o listener só existe em quem estiver
// carregado no momento do tap.
//
// Hoje só existe um tipo de notificação com deep link: "fim_dia" (ver
// api/finalizacao-dia/route.ts), que leva pra Relatórios. Se surgir um novo
// tipo, é só adicionar mais um `if` aqui.
//
// router.push (em vez de window.location.href) porque já estamos dentro do
// próprio app Next.js do Housekeeping — o Router do Next já aplica o
// basePath "/governance" sozinho.
export default function PushTapHandler() {
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
          const tipo = acao.notification.data?.tipo;
          if (tipo === "fim_dia") {
            router.push("/relatorios");
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
  }, [router]);

  return null;
}
