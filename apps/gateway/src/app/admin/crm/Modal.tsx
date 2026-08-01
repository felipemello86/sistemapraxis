"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Popup usado pelo slot @modal (ver ../@modal/(.)[leadId]/page.tsx) —
// router.back() fecha e volta pro board por trás, sem recarregar a página.
// Esc e clique fora também fecham. children é o mesmo conteúdo Server
// Component (LeadDetalheConteudo) usado na página cheia.
export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [router]);

  return (
    <div
      onClick={() => router.back()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "center",
        // alignItems: "flex-start" (pedido do Felipe, 31/07/2026) — antes
        // sem essa propriedade o popup ficava centralizado verticalmente
        // (comportamento padrão do flex em bloco único); agora abre
        // encostado no topo, logo abaixo do padding.
        alignItems: "flex-start",
        padding: "40px 16px",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, height: "fit-content", position: "relative" }}>
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: -14,
            right: -14,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "none",
            background: "#1d1d1f",
            color: "#fff",
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
