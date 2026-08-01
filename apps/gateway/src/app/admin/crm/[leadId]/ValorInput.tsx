"use client";

import { useState } from "react";

// Campo "Valor (R$)" editável na tela de detalhe (30/07/2026) — mesmo
// padrão do FonteSelect (dispara a server action direto, sem <form>), mas
// no onBlur em vez de onChange: um <input type="number"> dispararia a
// action a cada dígito digitado se fosse onChange.
export function ValorInput({
  leadId,
  valorAtual,
  action,
}: {
  leadId: string;
  valorAtual: number;
  action: (leadId: string, valor: string) => Promise<void>;
}) {
  const [valor, setValor] = useState(String(valorAtual));

  return (
    <input
      type="number"
      min={0}
      step="0.01"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => {
        if (valor.trim() === "" || Number(valor) === valorAtual) return;
        void action(leadId, valor);
      }}
      style={{
        // 100 (era 120) — ajuda Valor/Fonte/Parceiro caberem numa linha só
        // no popup (pedido do Felipe, 31/07/2026).
        padding: "8px 10px",
        borderRadius: 9,
        border: "1px solid #d2d2d7",
        background: "#fff",
        fontSize: 13,
        width: 100,
      }}
    />
  );
}
