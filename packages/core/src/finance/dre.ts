// Motor de cálculo da "DRE viva" — pedido do Felipe, 05/08/2026. Não são
// regras contábeis oficiais, são as regras de gestão dele (ver requisito 9
// da spec original). Duas peças fazem o trabalho pesado deste arquivo:
//
//   1. Referência temporal = Data de Vencimento (requisito 3): uma DRE de um
//      mês é a soma de todo FinanceLancamento cuja dataVencimento cai
//      naquele mês. Parcelas já são linhas próprias no banco (uma por mês —
//      ver seed/CRUD), então não precisam de projeção nenhuma aqui.
//
//   2. Recorrência (requisito 4) é o caso que PRECISA de projeção: existe
//      uma única linha no banco (recorrente=true), e este módulo "aparece"
//      ela virtualmente em todo mês a partir da dataVencimento original até
//      recorrenciaFimData (ou indefinidamente). Nada é gravado no banco pra
//      isso — é recalculado a cada consulta.
//
// Fórmula fixa da DRE (replicada da planilha real do Felipe, verificada
// aritmeticamente linha a linha em "DRE Julho 2026.xlsx"):
//
//   Margem Bruta      = RECEITA_BRUTA + GASTOS_VARIAVEIS + DESPESAS_VEICULOS
//   Despesas          = DESPESAS_FUNCIONARIOS + DESPESAS_ADMINISTRATIVAS + DESPESAS_SEDE
//   Geração de Caixa  = Margem Bruta + Despesas
//   Lucro/Prejuízo    = Geração de Caixa + DESPESAS_DIRETORIA + FINANCEIRAS
//
// (Os nomes dos blocos já vêm com sinal embutido no `valor` de cada
// lançamento — despesa é negativa, receita é positiva — então "somar tudo"
// é sempre a operação certa, nunca precisa de subtração explícita.)

import { prisma } from "../prisma";
import { Prisma } from "../../generated";

export const DRE_BLOCOS = [
  "RECEITA_BRUTA",
  "GASTOS_VARIAVEIS",
  "DESPESAS_VEICULOS",
  "DESPESAS_FUNCIONARIOS",
  "DESPESAS_ADMINISTRATIVAS",
  "DESPESAS_SEDE",
  "DESPESAS_DIRETORIA",
  "FINANCEIRAS",
] as const;

export type DreBloco = (typeof DRE_BLOCOS)[number];

// Rótulos em pt-BR pra exibição — mesmos nomes da planilha original do
// Felipe, fonte única pra qualquer tela que precise mostrar um bloco
// (evita cada componente reinventar essa tradução).
export const DRE_BLOCO_LABELS: Record<DreBloco, string> = {
  RECEITA_BRUTA: "Receita Bruta",
  GASTOS_VARIAVEIS: "Gastos Variáveis",
  DESPESAS_VEICULOS: "Despesas com Veículos e Transporte",
  DESPESAS_FUNCIONARIOS: "Despesas com Funcionários",
  DESPESAS_ADMINISTRATIVAS: "Despesas Administrativas e Comerciais",
  DESPESAS_SEDE: "Despesas com Sede e Estrutura",
  DESPESAS_DIRETORIA: "Despesas com Diretoria",
  FINANCEIRAS: "Despesas e Receitas Financeiras",
};

const ZERO = new Prisma.Decimal(0);

export interface DreLinhaLancamento {
  id: string;
  categoriaId: string | null;
  descricao: string;
  fornecedor: string | null;
  valor: Prisma.Decimal;
  dataEfetiva: string; // YYYY-MM-DD dentro do mês consultado
  projetadaDeRecorrencia: boolean; // true = ocorrência virtual (mês diferente do lançamento raiz)
}

export interface DreCategoriaResumo {
  categoriaId: string;
  nome: string;
  bloco: DreBloco;
  total: Prisma.Decimal;
  orcado: Prisma.Decimal | null;
  lancamentos: DreLinhaLancamento[];
}

export interface DreBlocoResumo {
  bloco: DreBloco;
  total: Prisma.Decimal;
  orcado: Prisma.Decimal | null;
  categorias: DreCategoriaResumo[];
}

export interface DreMensal {
  mes: string; // YYYY-MM
  blocos: DreBlocoResumo[];
  margemBrutaRS: Prisma.Decimal;
  despesasRS: Prisma.Decimal;
  geracaoDeCaixaRS: Prisma.Decimal;
  lucroPrejuizoRS: Prisma.Decimal;
  // categoriaId nulo — vieram da varredura Pluggy e ainda não foram
  // categorizados (requisito 6: sistema deve "provocar" o Felipe pra
  // resolver isso). Não entram em nenhum bloco/rollup até serem
  // categorizados.
  pendentesCategorizacao: DreLinhaLancamento[];
}

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
function projetarDataNoMes(dataVencimentoRaiz: string, mesAlvo: string): string {
  const diaRaiz = Number(dataVencimentoRaiz.slice(8, 10));
  const { ultimoDia } = limitesDoMes(mesAlvo);
  const dia = Math.min(diaRaiz, ultimoDia);
  return `${mesAlvo}-${String(dia).padStart(2, "0")}`;
}

/** Calcula a DRE de um tenant para um mês específico (passado, atual ou
 * futuro — mesma função pras três situações, requisito 2). */
export async function calcularDre(tenantId: string, mes: string): Promise<DreMensal> {
  const { inicio, fim } = limitesDoMes(mes);

  const [categorias, lancamentosDoMes, candidatosRecorrentes, orcamentosDoMes] = await Promise.all([
    prisma.financeCategoria.findMany({ where: { tenantId } }),
    prisma.financeLancamento.findMany({
      where: { tenantId, recorrente: false, dataVencimento: { gte: inicio, lte: fim } },
    }),
    prisma.financeLancamento.findMany({
      where: {
        tenantId,
        recorrente: true,
        dataVencimento: { lte: fim },
        OR: [{ recorrenciaFimData: null }, { recorrenciaFimData: { gte: inicio } }],
      },
    }),
    prisma.financeOrcamento.findMany({ where: { tenantId, mes } }),
  ]);

  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));

  const linhas: DreLinhaLancamento[] = [];

  for (const l of lancamentosDoMes) {
    linhas.push({
      id: l.id,
      categoriaId: l.categoriaId,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      valor: l.valor,
      dataEfetiva: l.dataVencimento,
      projetadaDeRecorrencia: false,
    });
  }

  for (const l of candidatosRecorrentes) {
    const raizEstaNesteMes = l.dataVencimento >= inicio && l.dataVencimento <= fim;
    linhas.push({
      id: l.id,
      categoriaId: l.categoriaId,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      valor: l.valor,
      dataEfetiva: raizEstaNesteMes ? l.dataVencimento : projetarDataNoMes(l.dataVencimento, mes),
      projetadaDeRecorrencia: !raizEstaNesteMes,
    });
  }

  const pendentesCategorizacao = linhas.filter((l) => l.categoriaId === null);

  const orcadoPorCategoria = new Map<string, Prisma.Decimal>();
  const orcadoPorBloco = new Map<DreBloco, Prisma.Decimal>();
  for (const o of orcamentosDoMes) {
    if (o.alvoTipo === "CATEGORIA") {
      orcadoPorCategoria.set(o.alvoChave, o.valor);
    } else if (o.alvoTipo === "BLOCO") {
      orcadoPorBloco.set(o.alvoChave as DreBloco, o.valor);
    }
  }

  // Agrupa por categoria (só lançamentos já categorizados)
  const linhasPorCategoria = new Map<string, DreLinhaLancamento[]>();
  for (const l of linhas) {
    if (!l.categoriaId) continue;
    const arr = linhasPorCategoria.get(l.categoriaId) ?? [];
    arr.push(l);
    linhasPorCategoria.set(l.categoriaId, arr);
  }

  const categoriasPorBloco = new Map<DreBloco, DreCategoriaResumo[]>();
  for (const [categoriaId, linhasDaCategoria] of linhasPorCategoria) {
    const categoria = categoriaPorId.get(categoriaId);
    if (!categoria) continue; // categoria foi apagada de fato (raro — ver onDelete: SetNull) — ignora, não quebra a DRE
    const bloco = categoria.bloco as DreBloco;
    const total = linhasDaCategoria.reduce((acc, l) => acc.add(l.valor), ZERO);
    const resumo: DreCategoriaResumo = {
      categoriaId,
      nome: categoria.nome,
      bloco,
      total,
      orcado: orcadoPorCategoria.get(categoriaId) ?? null,
      lancamentos: linhasDaCategoria.sort((a, b) => a.dataEfetiva.localeCompare(b.dataEfetiva)),
    };
    const arr = categoriasPorBloco.get(bloco) ?? [];
    arr.push(resumo);
    categoriasPorBloco.set(bloco, arr);
  }

  // Ordena categorias dentro de cada bloco pela `ordem` do catálogo (mesma
  // ordem de exibição da planilha original)
  for (const arr of categoriasPorBloco.values()) {
    arr.sort((a, b) => (categoriaPorId.get(a.categoriaId)?.ordem ?? 0) - (categoriaPorId.get(b.categoriaId)?.ordem ?? 0));
  }

  const blocos: DreBlocoResumo[] = DRE_BLOCOS.map((bloco) => {
    const categoriasDoBloco = categoriasPorBloco.get(bloco) ?? [];
    const total = categoriasDoBloco.reduce((acc, c) => acc.add(c.total), ZERO);
    return {
      bloco,
      total,
      orcado: orcadoPorBloco.get(bloco) ?? null,
      categorias: categoriasDoBloco,
    };
  });

  const totalPorBloco = new Map(blocos.map((b) => [b.bloco, b.total]));
  const somar = (...nomes: DreBloco[]) => nomes.reduce((acc, b) => acc.add(totalPorBloco.get(b) ?? ZERO), ZERO);

  const margemBrutaRS = somar("RECEITA_BRUTA", "GASTOS_VARIAVEIS", "DESPESAS_VEICULOS");
  const despesasRS = somar("DESPESAS_FUNCIONARIOS", "DESPESAS_ADMINISTRATIVAS", "DESPESAS_SEDE");
  const geracaoDeCaixaRS = margemBrutaRS.add(despesasRS);
  const lucroPrejuizoRS = geracaoDeCaixaRS.add(totalPorBloco.get("DESPESAS_DIRETORIA") ?? ZERO).add(totalPorBloco.get("FINANCEIRAS") ?? ZERO);

  return {
    mes,
    blocos,
    margemBrutaRS,
    despesasRS,
    geracaoDeCaixaRS,
    lucroPrejuizoRS,
    pendentesCategorizacao,
  };
}
