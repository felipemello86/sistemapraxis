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
        // maxWidth pelo mesmo motivo do FonteSelect.tsx — cabe junto de
        // Valor/Fonte numa linha só no popup.
        padding: "8px 10px",
        borderRadius: 9,
        border: "1px solid #d2d2d7",
        background: "#fff",
        fontSize: 13,
        cursor: "pointer",
        maxWidth: 140,
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
