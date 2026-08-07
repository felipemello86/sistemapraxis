// Validação de conformidade da DRE — pedido do Felipe, 07/08/2026:
// "Todas DRE terá um símbolo de verificação de cumprimento de regras de
// validação (...) as regras definidas devem ao mesmo tempo auxiliar tanto
// no processo de sugestão de preenchimento como no processo de validação da
// DRE". As mesmas 3 regras abaixo servem os dois propósitos: aqui elas
// validam (apontam o que está faltando/duplicado num mês fechado); o mesmo
// texto de cada item também funciona como checklist do que falta preencher
// (não existe uma "sugestão" separada — a lista de pendências JÁ é a
// sugestão, ver DreView.tsx).
//
// Escopo dos dados (definido pelo Felipe, 07/08/2026): só conta lançamentos
// REAIS/já ocorridos — mesma query de `lancamentosDoMes` em dre.ts
// (recorrente=false, Data de Vencimento dentro do mês). Uma provisão
// recorrente ainda não paga NÃO conta como cumprida — só quando vira (ou já
// nasce) um lançamento real não-recorrente daquele mês específico.
//
// Regra 1: cada UH ATIVA no mês (mesmo critério de centro-de-custo.ts:
// ativo=true OU desativadaEm >= mês) deve ter exatamente 1 lançamento de
// Aluguel (Flats) e exatamente 1 de Energia Elétrica (Flats) — nem mais,
// nem menos.
// Regra 2: o mês deve ter pelo menos 1 lançamento de Diárias de Plataformas
// e pelo menos 1 de Reserva Direta (qualquer centro de custo).
// Regra 3: o mês deve ter pelo menos 1 lançamento de Simples Nacional - DAS.
//
// Os nomes de categoria são resolvidos por NOME (não por id fixo) porque
// Categorias são editáveis por tenant (Configurações) — se o Felipe renomear
// uma dessas categorias, a regra correspondente fica sinalizada como
// "categoria não encontrada" em vez de falhar silenciosamente.

import { prisma } from "../prisma";
import { limitesDoMes } from "./mes";

export type RegraValidacaoDre = "ALUGUEL_ENERGIA" | "DIARIAS_RESERVA" | "SIMPLES_NACIONAL" | "SETUP";

export interface ItemValidacaoDre {
  regra: RegraValidacaoDre;
  mensagem: string;
}

export interface ValidacaoDre {
  ok: boolean;
  itens: ItemValidacaoDre[];
}

const NOME_CATEGORIA_ALUGUEL = "Aluguel (Flats)";
const NOME_CATEGORIA_ENERGIA = "Energia Elétrica (Flats)";
const NOME_CATEGORIA_DIARIAS = "Diárias de Plataformas";
const NOME_CATEGORIA_RESERVA_DIRETA = "Reserva Direta";
const NOME_CATEGORIA_SIMPLES = "Simples Nacional - DAS";

export async function validarDre(tenantId: string, mes: string): Promise<ValidacaoDre> {
  const { inicio, fim } = limitesDoMes(mes);

  const [uhsAtivas, categorias, reais] = await Promise.all([
    // Mesmo critério de "UH ativa nesse mês" de carregarContextoRateio em
    // centro-de-custo.ts.
    prisma.uH.findMany({
      where: { tenantId, OR: [{ ativo: true }, { desativadaEm: { gte: mes } }] },
      select: { id: true, numero: true },
    }),
    prisma.financeCategoria.findMany({ where: { tenantId }, select: { id: true, nome: true } }),
    // Mesma query de `lancamentosDoMes` em dre.ts — só o real/não-recorrente
    // conta como "cumprido" (ver nota de escopo no topo do arquivo).
    prisma.financeLancamento.findMany({
      where: { tenantId, recorrente: false, dataVencimento: { gte: inicio, lte: fim } },
      select: { categoriaId: true, centroCustoTipo: true, uhId: true },
    }),
  ]);

  const idPorNome = new Map(categorias.map((c) => [c.nome, c.id]));
  const idAluguel = idPorNome.get(NOME_CATEGORIA_ALUGUEL) ?? null;
  const idEnergia = idPorNome.get(NOME_CATEGORIA_ENERGIA) ?? null;
  const idDiarias = idPorNome.get(NOME_CATEGORIA_DIARIAS) ?? null;
  const idReservaDireta = idPorNome.get(NOME_CATEGORIA_RESERVA_DIRETA) ?? null;
  const idSimples = idPorNome.get(NOME_CATEGORIA_SIMPLES) ?? null;

  const itens: ItemValidacaoDre[] = [];

  for (const [nome, id] of [
    [NOME_CATEGORIA_ALUGUEL, idAluguel],
    [NOME_CATEGORIA_ENERGIA, idEnergia],
    [NOME_CATEGORIA_DIARIAS, idDiarias],
    [NOME_CATEGORIA_RESERVA_DIRETA, idReservaDireta],
    [NOME_CATEGORIA_SIMPLES, idSimples],
  ] as const) {
    if (!id) itens.push({ regra: "SETUP", mensagem: `Categoria "${nome}" não encontrada — verifique se ela foi renomeada em Configurações` });
  }

  // Regra 1: 1 Aluguel + 1 Energia por UH ativa.
  if (idAluguel || idEnergia) {
    const contagemPorUh = new Map<string, { aluguel: number; energia: number }>();
    for (const uh of uhsAtivas) contagemPorUh.set(uh.id, { aluguel: 0, energia: 0 });
    for (const l of reais) {
      if (l.centroCustoTipo !== "UNIDADE" || !l.uhId) continue;
      const c = contagemPorUh.get(l.uhId);
      if (!c) continue; // lançamento de uma UH que não está ativa nesse mês — fora do escopo da regra
      if (idAluguel && l.categoriaId === idAluguel) c.aluguel++;
      if (idEnergia && l.categoriaId === idEnergia) c.energia++;
    }
    for (const uh of uhsAtivas) {
      const c = contagemPorUh.get(uh.id)!;
      if (idAluguel) {
        if (c.aluguel === 0) itens.push({ regra: "ALUGUEL_ENERGIA", mensagem: `UH ${uh.numero}: falta lançamento de Aluguel` });
        else if (c.aluguel > 1) itens.push({ regra: "ALUGUEL_ENERGIA", mensagem: `UH ${uh.numero}: ${c.aluguel} lançamentos de Aluguel (esperado 1)` });
      }
      if (idEnergia) {
        if (c.energia === 0) itens.push({ regra: "ALUGUEL_ENERGIA", mensagem: `UH ${uh.numero}: falta lançamento de Energia Elétrica` });
        else if (c.energia > 1) itens.push({ regra: "ALUGUEL_ENERGIA", mensagem: `UH ${uh.numero}: ${c.energia} lançamentos de Energia Elétrica (esperado 1)` });
      }
    }
  }

  // Regra 2: Diárias de Plataformas + Reserva Direta (pelo menos 1 cada, tenant-wide).
  if (idDiarias && !reais.some((l) => l.categoriaId === idDiarias)) {
    itens.push({ regra: "DIARIAS_RESERVA", mensagem: "Falta lançamento de Diárias de Plataformas" });
  }
  if (idReservaDireta && !reais.some((l) => l.categoriaId === idReservaDireta)) {
    itens.push({ regra: "DIARIAS_RESERVA", mensagem: "Falta lançamento de Reserva Direta" });
  }

  // Regra 3: Simples Nacional - DAS (pelo menos 1, tenant-wide).
  if (idSimples && !reais.some((l) => l.categoriaId === idSimples)) {
    itens.push({ regra: "SIMPLES_NACIONAL", mensagem: "Falta lançamento de Simples Nacional - DAS" });
  }

  return { ok: itens.length === 0, itens };
}
