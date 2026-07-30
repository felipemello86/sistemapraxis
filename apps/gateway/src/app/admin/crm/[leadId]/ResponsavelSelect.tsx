"use client";

// Mesmo padrão do EtapaSelect (../EtapaSelect.tsx): <select> que já dispara a
// server action no onChange, sem precisar de um botão "Salvar" separado.
export function ResponsavelSelect({
  leadId,
  responsavelAtualId,
  admins,
  action,
}: {
  leadId: string;
  responsavelAtualId: string | null;
  admins: Array<{ id: string; nome: string }>;
  action: (leadId: string, responsavelId: string) => Promise<void>;
}) {
  return (
    <select
      defaultValue={responsavelAtualId ?? ""}
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
      <option value="">Sem responsável</option>
      {admins.map((a) => (
        <option key={a.id} value={a.id}>
          {a.nome}
        </option>
      ))}
    </select>
  );
}
