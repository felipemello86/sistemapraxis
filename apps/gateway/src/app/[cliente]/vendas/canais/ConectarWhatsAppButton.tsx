"use client";

import { useEffect, useRef, useState } from "react";
import type { ConectarWhatsAppResult } from "./actions";

// Botão "Conectar WhatsApp" — Embedded Signup v4 da Meta (06/08/2026).
// Implementação segue a doc oficial ao pé da letra (developers.facebook.com
// /documentation/business-messaging/whatsapp/embedded-signup/implementation),
// porque duas peças aqui são fáceis de errar e não têm como testar
// incrementalmente: o `code` vem do callback do FB.login(), MAS o
// waba_id/phone_number_id escolhidos pelo usuário no popup vêm de um
// listener de `window.message` SEPARADO — não tem como capturar os três
// dados de um único callback.
//
// v4 não usa mais `sessionInfoVersion` nem `extras` preenchido (isso era
// de v2/v3, hoje obsoleto) — a versão do fluxo é implícita pela
// Configuration escolhida no App Dashboard (config_id).
declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        params: { config_id: string; response_type: string; override_default_response_type: boolean; extras: Record<string, never> }
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type SignupEventData = {
  type?: string;
  event?: string;
  data?: { phone_number_id?: string; waba_id?: string };
};

export function ConectarWhatsAppButton({
  action,
  jaConectado,
}: {
  action: (code: string, wabaId: string, phoneNumberId: string) => Promise<ConectarWhatsAppResult>;
  jaConectado: boolean;
}) {
  const [status, setStatus] = useState<"ocioso" | "aguardando" | "salvando" | "erro">("ocioso");
  const [erro, setErro] = useState<string | null>(null);
  // Guarda o waba_id/phone_number_id vindos do listener de `message" até o
  // FB.login() também terminar com o `code` — só manda pro servidor quando
  // os dois já chegaram (podem chegar em qualquer ordem).
  const sessaoRef = useRef<{ wabaId?: string; phoneNumberId?: string; code?: string }>({});

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const configId = process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID;

  useEffect(() => {
    if (!appId) return;
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
    };
    if (document.getElementById("facebook-jssdk")) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
  }, [appId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      let data: SignupEventData;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // mensagem não-JSON de outra origem facebook.com qualquer — ignora
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "FINISH" && data.data?.waba_id && data.data?.phone_number_id) {
        sessaoRef.current.wabaId = data.data.waba_id;
        sessaoRef.current.phoneNumberId = data.data.phone_number_id;
        tentarFinalizar();
      } else if (data.event === "CANCEL") {
        setStatus("ocioso");
      } else if (data.event === "ERROR") {
        setStatus("erro");
        setErro("A Meta reportou um erro durante a conexão. Tenta de novo.");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tentarFinalizar() {
    const { code, wabaId, phoneNumberId } = sessaoRef.current;
    if (!code || !wabaId || !phoneNumberId) return; // ainda falta alguma peça
    setStatus("salvando");
    const resultado = await action(code, wabaId, phoneNumberId);
    if (resultado.ok) {
      setStatus("ocioso");
      sessaoRef.current = {};
    } else {
      setStatus("erro");
      setErro(resultado.erro);
    }
  }

  function abrirPopup() {
    if (!window.FB || !appId || !configId) {
      setStatus("erro");
      setErro("Integração não configurada ainda (faltam variáveis de ambiente do Facebook App).");
      return;
    }
    setErro(null);
    setStatus("aguardando");
    sessaoRef.current = {};
    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          sessaoRef.current.code = response.authResponse.code;
          tentarFinalizar();
        } else {
          setStatus("ocioso");
        }
      },
      { config_id: configId, response_type: "code", override_default_response_type: true, extras: {} }
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={abrirPopup}
        disabled={status === "aguardando" || status === "salvando"}
        style={{
          padding: "9px 16px",
          borderRadius: 9,
          border: "none",
          background: "#25D366",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: status === "ocioso" || status === "erro" ? "pointer" : "default",
          opacity: status === "aguardando" || status === "salvando" ? 0.7 : 1,
        }}
      >
        {status === "salvando"
          ? "Salvando conexão..."
          : status === "aguardando"
            ? "Aguardando popup..."
            : jaConectado
              ? "Reconectar WhatsApp"
              : "Conectar WhatsApp"}
      </button>
      {erro && <p style={{ color: "#d70015", fontSize: 13, marginTop: 8 }}>{erro}</p>}
    </div>
  );
}
