"use client";

// Mesmo padrão do FonteSelect.tsx: <select> que já dispara a server action
// no onChange, sem <form>. Só aparece na tela de detalhe quando
// lead.fonte === "Indicação" (ver LeadDetalheConteudo.tsx) — pedido do
// Felipe (31/07/2026): "cada card deve ter então o campo Parceiro quando a
// fonte selecionada for Indicação". Opcional mesmo nesse caso: sempre tem a
// opção "— Nenhum —".
export function ParceiroSelect({
  leadId,
  parceiroIdAtual,
  parceiros,
  action,
}: {
  leadId: string;
  parceiroIdAtual: string | null;
  parceiros: Array<{ id: string; nome: string }>;
  action: (leadId: string, parceiroId: string) => Promise<void>;
}) {
  return (
    <select
      defaultValue={parceiroIdAtual ?? ""}
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
      <option value="">— Nenhum —</option>
      {parceiros.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  );
}
