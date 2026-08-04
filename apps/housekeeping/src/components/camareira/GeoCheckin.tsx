"use client";
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";

// Georreferenciamento — captura silenciosa (sem UI, `return null`) da
// localização da camareira enquanto ela usa a tela "Minhas UHs". Mesmo
// padrão de PushRegistration (apps/gateway/.../PushRegistration.tsx): só
// roda dentro do app nativo (Capacitor); em navegador comum é um no-op.
//
// Essa é a degradação graciosa combinada com o Felipe: sem GPS disponível
// (navegador comum, permissão negada, timeout, etc.), nenhum GeoArrival é
// criado — e o relógio de disponibilidade (apps/housekeeping/src/app/api/
// scores/route.ts) simplesmente cai no comportamento atual (turnoInicioHora
// / liberadaEm / fim da sessão anterior), sem bloquear a camareira.
//
// Envia só as coordenadas cruas pro backend a cada INTERVALO_MS — quem
// decide se ela está dentro do raio de alguma Property (das UHs atribuídas
// a ela hoje) é o servidor (POST /api/geo/checkin), via haversine. Idempotente:
// uma vez registrada a chegada numa property no dia, chamadas seguintes não
// sobrescrevem o horário (ver upsert com update:{} no endpoint).
const INTERVALO_MS = 60_000;

// Esteve DESATIVADO de 28/07/2026 a 04/08/2026 — suspeita inicial era de
// crash nativo (SIGABRT) por falta de NSLocationWhenInUseUsageDescription
// no Info.plist do projeto iOS. Investigação no Xcode + App Store Connect
// (04/08) descartou essa hipótese: o Info.plist já tinha essa chave desde
// 22/07 (antes até do único build já testado, 1.0(2), gerado no mesmo dia),
// e os 2 crashes reais registrados no TestFlight nesse build são ambos no
// fluxo de anexar/enviar foto em Inspeção ("Quando tento mandar fotos ele
// automaticamente ele fecha o aplicativo" / "Adicionar foto na inspeção
// quebrou") — nada relacionado a localização. Reativado com base nisso.
// Segue best-effort/degradação graciosa (ver comentário acima): sem GPS
// disponível, simplesmente não cria GeoArrival nenhum.
const DESATIVADO = false;

export default function GeoCheckin() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (DESATIVADO) return;
    let cancelled = false;

    async function tentarCheckin() {
      if (typeof window === "undefined" || !(window as any).Capacitor) return;

      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { Geolocation } = await import("@capacitor/geolocation");

        const atual = await Geolocation.checkPermissions();
        let concedida = atual.location === "granted" || atual.coarseLocation === "granted";
        if (!concedida && atual.location !== "denied") {
          const pedido = await Geolocation.requestPermissions();
          concedida = pedido.location === "granted" || pedido.coarseLocation === "granted";
        }
        if (!concedida || cancelled) return;

        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
        if (cancelled) return;

        await apiFetch("/api/geo/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        }).catch(() => {});
      } catch {
        // GPS indisponível, permissão negada, timeout, plugin não instalado
        // ainda (antes do próximo build nativo) — melhor esforço, nunca
        // bloqueia a tela da camareira.
      }
    }

    tentarCheckin();
    intervalRef.current = setInterval(tentarCheckin, INTERVALO_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}
