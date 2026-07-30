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

// Validação (30/07/2026, pedido do Felipe: "o campo telefone precisa estar
// no formato obrigatoriamente compatível com o formato WhatsApp, senão vai
// ter problema de integração, principalmente nos leads gerados
// manualmente") — usada em criarLeadManualAction e atualizarTelefoneAction
// pra recusar número incompleto/errado ANTES de gravar, já que um telefone
// ruim quebra silenciosamente o envio e o casamento de mensagens recebidas
// (ver ./data.ts, encontrarOuCriarLeadPorTelefone). Brasil: DDI(55) + DDD(2)
// + 8 dígitos (fixo) ou 9 dígitos (celular) = 12 ou 13 dígitos no total
// depois de normalizarTelefone.
export function telefoneValido(v: string): boolean {
  const digitos = normalizarTelefone(v);
  return digitos.length === 12 || digitos.length === 13;
}

// Formato de exibição consistente (E.164-like) pra gravar no banco — assim
// todo lead (independente de como foi digitado na criação) fica com o
// telefone já pronto pra WhatsApp, sem depender de normalizarTelefone toda
// vez que alguém olhar o valor bruto. Ex: "5584981869200" → "+55 84 98186-9200".
export function formatarTelefoneExibicao(v: string): string {
  const digitos = normalizarTelefone(v);
  if (digitos.length !== 12 && digitos.length !== 13) return v.trim(); // inválido — não tenta formatar, deixa como veio

  const ddi = digitos.slice(0, 2);
  const ddd = digitos.slice(2, 4);
  const numero = digitos.slice(4);
  const meio = numero.length === 9 ? numero.slice(0, 5) : numero.slice(0, 4);
  const fim = numero.length === 9 ? numero.slice(5) : numero.slice(4);
  return `+${ddi} ${ddd} ${meio}-${fim}`;
}
