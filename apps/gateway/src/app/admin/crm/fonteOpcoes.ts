// Opções pré-definidas de "fonte" do lead (de onde ele veio) — compartilhado
// entre NovoLeadForm.tsx (criação manual) e [leadId]/FonteSelect.tsx (edição
// depois). "Site" também existe fora dessa lista de opções manuais porque é
// gravado automaticamente pelo POST /api/demo, nunca escolhido por alguém —
// mas ainda aparece aqui pra dar pra corrigir manualmente se um lead do site
// precisar ser recategorizado.
export const FONTE_OPCOES = ["Site", "WhatsApp", "Indicação", "Telefone", "Evento", "Outro"];
