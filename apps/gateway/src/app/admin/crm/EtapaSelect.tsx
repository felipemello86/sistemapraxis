"use client";

// <select> que move o lead de etapa assim que o usuário escolhe uma opção
// diferente — sem drag-and-drop (baixo volume de leads/etapas não justifica
// a complexidade de uma lib de DnD). Precisa ser client component só por
// causa do onChange; o trabalho de verdade acontece na server action.
export function EtapaSelect({
  leadId,
  etapaAtualId,
  etapas,
  action,
}: {
  leadId: string;
  etapaAtualId: string | null;
  etapas: Array<{ id: string; nome: string }>;
  action: (leadId: string, novaEtapaId: string) => Promise<void>;
}) {
  return (
    <select
      defaultValue={etapaAtualId ?? ""}
      onChange={(e) => {
        const novaEtapaId = e.target.value;
        if (novaEtapaId && novaEtapaId !== etapaAtualId) action(leadId, novaEtapaId);
      }}
      style={{
        padding: "5px 8px",
        borderRadius: 8,
        border: "1px solid #d2d2d7",
        background: "#fff",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {!etapaAtualId && <option value="">Sem etapa</option>}
      {etapas.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nome}
        </option>
      ))}
    </select>
  );
}
