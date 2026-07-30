// Normalização de telefone pra casar o número que manda mensagem no
// WhatsApp (webhook da Meta sempre manda dígitos puros com código do país,
// ex: "5581989526361") com o que foi digitado no CRM (formatos livres, ex:
// "(81) 98952-6361", "81 98952-6361", "+55 81 98952-6361"). Só remove
// não-dígitos e assume Brasil (55) quando faltar código do país — suficiente
// pro volume/escopo atual (CRM só vende pra hotéis brasileiros).
export function normalizarTelefone(v: string): string {
  const digitos = v.replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.length <= 11) return `55${digitos}`; // sem DDI — assume Brasil
  return digitos;
}
