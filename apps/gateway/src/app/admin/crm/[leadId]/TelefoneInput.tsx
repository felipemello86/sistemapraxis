"use client";

import { useState } from "react";

// Campo "Telefone" editável na tela de detalhe (30/07/2026, pedido do
// Felipe: garantir formato compatível com WhatsApp, principalmente pra
// leads criados manualmente que já vieram com número errado/incompleto).
// Mesmo padrão do ValorInput.tsx (dispara a server action no onBlur, sem
// <form>) — a validação de verdade acontece no server (telefoneValido em
// ../telefone.ts); aqui só formata visualmente o que já foi salvo.
export function TelefoneInput({
  leadId,
  telefoneAtual,
  action,
}: {
  leadId: string;
  telefoneAtual: string;
  action: (leadId: string, telefone: string) => Promise<void>;
}) {
  const [telefone, setTelefone] = useState(telefoneAtual);
  const [aviso, setAviso] = useState(false);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <input
        type="tel"
        value={telefone}
        onChange={(e) => {
          setTelefone(e.target.value);
          setAviso(false);
        }}
        onBlur={() => {
          if (telefone.trim() === telefoneAtual.trim()) return;
          // Checagem grosseira só pra feedback visual imediato — a
          // validação que realmente importa (bloqueia gravação errada)
          // roda no server, ver atualizarTelefoneAction.
          const digitos = telefone.replace(/\D/g, "");
          if (digitos.length < 10) {
            setAviso(true);
            return;
          }
          void action(leadId, telefone);
        }}
        placeholder="(81) 98952-6361"
        style={{
          padding: "8px 12px",
          borderRadius: 9,
          border: aviso ? "1px solid #d70015" : "1px solid #d2d2d7",
          background: "#fff",
          fontSize: 13,
          width: 170,
        }}
      />
      {aviso && <span style={{ fontSize: 11, color: "#d70015" }}>Inclua DDD + número completo.</span>}
    </div>
  );
}
