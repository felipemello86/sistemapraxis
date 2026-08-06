// Aritmética de mês (YYYY-MM / YYYY-MM-DD) pura, sem Prisma — extraída de
// dre.ts em 06/08/2026 pra lib/finance/conciliacao.ts poder usar sem criar
// import circular (conciliacao.ts precisa de limitesDoMes/projetarDataNoMes,
// e dre.ts precisa de funções de conciliacao.ts pro dedup de previstos
// cumpridos — ver comentário em calcularDre). dre.ts continua reexportando
// tudo daqui (`export * from "./mes"`), então nada que já importa essas
// funções de @praxis/core ou de "./dre" precisa mudar.

function validarMes(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new Error(`Mês inválido: "${mes}" (esperado YYYY-MM)`);
  }
}

/** Primeiro e último dia (YYYY-MM-DD) do mês, como strings — nunca via Date
 * pra evitar o bug clássico de fuso (ver timezone.ts). */
export function limitesDoMes(mes: string): { inicio: string; fim: string; ultimoDia: number } {
  validarMes(mes);
  const [anoStr, mesStr] = mes.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  // dia 0 do mês seguinte = último dia do mês atual (truque padrão de Date,
  // só usado aqui pra aritmética de calendário, nunca pra "hoje")
  const ultimoDia = new Date(ano, mesNum, 0).getDate();
  return {
    inicio: `${mes}-01`,
    fim: `${mes}-${String(ultimoDia).padStart(2, "0")}`,
    ultimoDia,
  };
}

/** Mês seguinte/anterior em formato YYYY-MM — usado pra navegação
 * passado/futuro da tela de DRE (requisito 2). */
export function mesAdjacente(mes: string, delta: number): string {
  validarMes(mes);
  const [anoStr, mesStr] = mes.split("-");
  let ano = Number(anoStr);
  let mesNum = Number(mesStr) + delta;
  while (mesNum > 12) {
    mesNum -= 12;
    ano += 1;
  }
  while (mesNum < 1) {
    mesNum += 12;
    ano -= 1;
  }
  return `${ano}-${String(mesNum).padStart(2, "0")}`;
}

/** Soma (ou subtrai) N meses a uma data YYYY-MM-DD, preservando o
 * dia-do-mês e clampando pro último dia válido quando necessário — usado
 * pra gerar as N parcelas de uma compra parcelada (requisito 3: cada
 * parcela é uma linha própria, uma por mês, a partir da Data de
 * Vencimento da 1ª parcela). */
export function somarMeses(dataISO: string, meses: number): string {
  const [anoStr, mesStr, diaStr] = dataISO.split("-");
  let ano = Number(anoStr);
  let mesNum = Number(mesStr) + meses;
  const dia = Number(diaStr);
  while (mesNum > 12) {
    mesNum -= 12;
    ano += 1;
  }
  while (mesNum < 1) {
    mesNum += 12;
    ano -= 1;
  }
  const mesAlvo = `${ano}-${String(mesNum).padStart(2, "0")}`;
  const { ultimoDia } = limitesDoMes(mesAlvo);
  const diaFinal = Math.min(dia, ultimoDia);
  return `${mesAlvo}-${String(diaFinal).padStart(2, "0")}`;
}

/** Projeta a data efetiva de uma ocorrência recorrente dentro do mês
 * consultado, preservando o dia-do-mês do lançamento raiz e "clampando"
 * pro último dia válido quando o mês consultado for mais curto (ex.: raiz
 * no dia 31, mês consultado é fevereiro -> vira 28 ou 29). */
export function projetarDataNoMes(dataVencimentoRaiz: string, mesAlvo: string): string {
  const diaRaiz = Number(dataVencimentoRaiz.slice(8, 10));
  const { ultimoDia } = limitesDoMes(mesAlvo);
  const dia = Math.min(diaRaiz, ultimoDia);
  return `${mesAlvo}-${String(dia).padStart(2, "0")}`;
}
