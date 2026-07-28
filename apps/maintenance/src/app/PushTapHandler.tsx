'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { resolverDestinoNotificacao } from '@/lib/pushDestino'

// Espelho de apps/housekeeping/src/app/PushTapHandler.tsx — trata o toque
// em notificação push ENQUANTO o app já está rodando dentro do Manutenção
// (webview já carregado neste basePath /upkeep). Complementa
// apps/gateway/src/app/[cliente]/PushRegistration.tsx (cold start) — precisa
// dos dois/três porque a navegação entre gateway e módulos é full-page
// (cross-app), destruindo e recriando o contexto JS a cada troca, então o
// listener só existe em quem estiver carregado no momento do tap.
//
// Pedido explícito do Felipe: notificação deve levar pra tela do próprio
// conteúdo dela, não sempre pra tela padrão — ver lib/pushDestino.ts.
//
// Se o destino é DENTRO do Manutenção (modulo="upkeep"), router.push num
// caminho tipo "/?view=correcao" basta — dashboard.tsx lê esse ?view= via
// useSearchParams pra trocar a aba ativa da SPA. Se o destino é OUTRO
// módulo (ex.: Housekeeping), precisa navegação cross-app de verdade
// (full-page), daí window.location — exige tenantSlug (prop, vem da sessão
// lida no layout.tsx raiz) e a URL pública do gateway.
export default function PushTapHandler({ tenantSlug }: { tenantSlug?: string }) {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).Capacitor) return
    let listenerHandle: { remove: () => void } | undefined

    ;(async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return

        const { PushNotifications } = await import('@capacitor/push-notifications')
        listenerHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (acao) => {
          const destino = resolverDestinoNotificacao(acao.notification.data as Record<string, string> | undefined)
          if (!destino) return

          if (destino.modulo === 'upkeep') {
            router.push(destino.caminho)
            return
          }

          if (tenantSlug) {
            const base = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://sistemaspraxis.com.br'
            window.location.href = `${base}/${tenantSlug}/${destino.modulo}${destino.caminho}`
          }
        })
      } catch {
        // best-effort — se o plugin não carregar (ex: fora do app nativo),
        // simplesmente não há deep link, sem quebrar o resto da tela.
      }
    })()

    return () => {
      listenerHandle?.remove()
    }
  }, [router, tenantSlug])

  return null
}
