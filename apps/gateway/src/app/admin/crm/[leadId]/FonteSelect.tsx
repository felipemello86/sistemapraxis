"use client";

import { FONTE_OPCOES } from "../fonteOpcoes";

// Mesmo padrão do EtapaSelect (../EtapaSelect.tsx): <select> que já dispara a
// server action no onChange. Ocupa o lugar que era do "Responsável"
// (removido a pedido do Felipe, 30/07/2026).
export function FonteSelect({
  leadId,
  fonteAtual,
  action,
}: {
  leadId: string;
  fonteAtual: string;
  action: (leadId: string, fonte: string) => Promise<void>;
}) {
  return (
    <select
      defaultValue={fonteAtual}
      onChange={(e) => action(leadId, e.target.value)}
      style={{
        padding: "8px 12px",
        borderRadius: 9,
        border: "1px solid #d2d2d7",
        background: "#fff",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {!FONTE_OPCOES.includes(fonteAtual) && <option value={fonteAtual}>{fonteAtual}</option>}
      {FONTE_OPCOES.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );
}
