import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma, limitesDoMes, somarMeses, dataAtualSP, calcularStatusLancamento, validarCategoriaTipo } from "@praxis/core";
import { randomUUID } from "crypto";

// CRUD manual de lançamentos (requisito 8 do TaskList / DRE viva). Cobre os
// 3 formatos possíveis de um lançamento (requisitos 3 e 4 da spec do
// Felipe):
//   - normal: 1 linha, 1 dataVencimento.
//   - parcelado: N linhas materializadas (parcelaGrupoId comum), uma por
//     mês a partir da Data de Vencimento da 1ª parcela.
//   - recorrente: 1 linha só, marcada `recorrente=true` — a projeção pros
//     meses seguintes é virtual (ver calcularDre em @praxis/core), nunca
//     grava linha nova aqui.
//
// Desde 05/08/2026 (pedido do Felipe: tela deve virar um extrato de
// verdade) também calcula `status` (Quitado/Vencido/A Vencer, ver
// lib/finance/status.ts) e `saldo` corrente por lançamento — este último só
// quando filtrado por UMA conta específica.

// GET /api/lancamentos?mes=YYYY-MM&dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&pendentes=1&categoriaId=xxx&contaBancariaId=xxx
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes");
  const dataInicioParam = searchParams.get("dataInicio");
  const dataFimParam = searchParams.get("dataFim");
  const pendentes = searchParams.get("pendentes") === "1";
  const categoriaId = searchParams.get("categoriaId");
  const contaBancariaId = searchParams.get("contaBancariaId");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (pendentes) where.categoriaId = null;
  if (categoriaId) where.categoriaId = categoriaId;
  if (contaBancariaId) where.contaBancariaId = contaBancariaId;

  // Período pode vir como `mes` (legado, YYYY-MM) ou como range explícito
  // (dataInicio/dataFim — usado pelos seletores de Ano/Hoje/Período
  // específico da tela de extrato).
  let inicio: string | null = null;
  let fim: string | null = null;
  if (mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return NextResponse.json({ error: `Mês inválido: "${mes}" (esperado YYYY-MM)` }, { status: 400 });
    }
    ({ inicio, fim } = limitesDoMes(mes));
  } else if (dataInicioParam && dataFimParam) {
    inicio = dataInicioParam;
    fim = dataFimParam;
  }

  // Quando filtra por UMA conta, o saldo corrente exige o HISTÓRICO
  // COMPLETO da conta na query (a âncora é o saldo de HOJE — pra achar o
  // saldo no início de um período passado, precisa caminhar por tudo que
  // aconteceu entre hoje e aquele período, não só pelo período em si). Por
  // isso: com conta selecionada, o período só é aplicado DEPOIS, filtrando
  // a resposta já calculada — nunca na query.
  const aplicarPeriodoNaQuery = !contaBancariaId;
  if (inicio && fim && aplicarPeriodoNaQuery) {
    // Lançamentos "reais" do período (não recorrentes) OU raízes de
    // recorrência já vigentes (dataVencimento <= fim, ainda sem ter
    // acabado). Só mostra a LINHA raiz aqui (não projeta ocorrências
    // virtuais) — CRUD só faz sentido em cima de linhas reais.
    where.OR = [
      { recorrente: false, dataVencimento: { gte: inicio, lte: fim } },
      { recorrente: true, dataVencimento: { lte: fim }, OR: [{ recorrenciaFimData: null }, { recorrenciaFimData: { gte: inicio } }] },
    ];
  }

  const lancamentos = await prisma.financeLancamento.findMany({
    where,
    include: {
      categoria: { select: { nome: true, tipo: true, bloco: { select: { nome: true } } } },
      contaBancaria: { select: { id: true, nome: true, apelido: true, tipo: true } },
      property: { select: { nome: true } },
      uh: { select: { numero: true } },
    },
    orderBy: { dataVencimento: "desc" },
    take: 5000,
  });

  const hoje = dataAtualSP();

  // Saldo corrente: só dá pra calcular filtrando por UMA conta (precisa da
  // âncora FinanceContaBancaria.saldoAtual). Caminha de trás pra frente
  // (mais recente -> mais antigo) "desfazendo" cada lançamento QUITADO pra
  // achar o saldo de antes dele; lançamento não-quitado (previsto) não
  // mexe no saldo real ainda, por definição. Roda sobre o histórico
  // COMPLETO (não o período filtrado) — o filtro de período só corta a
  // lista DEPOIS que os saldos já estão certos.
  const saldoPorId = new Map<string, number | null>();
  if (contaBancariaId) {
    const conta = await prisma.financeContaBancaria.findUnique({ where: { id: contaBancariaId } });
    if (conta?.saldoAtual != null) {
      let corrente = Number(conta.saldoAtual);
      const ordenadosDesc = [...lancamentos].sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento));
      for (const l of ordenadosDesc) {
        const status = calcularStatusLancamento({ contaTipo: l.contaBancaria?.tipo, pago: l.pago, dataVencimento: l.dataVencimento, hoje });
        if (status === "QUITADO") {
          saldoPorId.set(l.id, corrente);
          corrente -= Number(l.valor);
        } else {
          saldoPorId.set(l.id, null);
        }
      }
    }
  }

  // Achata categoria.bloco.nome -> categoria.bloco (string), mesma
  // convenção de /api/categorias — mantém o shape que as telas já esperam.
  // Idem pra empreendimento/unidade -> nome (string), evita include aninhado do lado do cliente.
  let resposta = lancamentos.map((l) => {
    const { property, uh, ...resto } = l;
    return {
      ...resto,
      categoria: l.categoria ? { nome: l.categoria.nome, tipo: l.categoria.tipo, bloco: l.categoria.bloco.nome } : null,
      // Apelido (pedido do Felipe, 07/08/2026) substitui o nome original da
      // Pluggy em toda tela de uso — aqui o extrato só mostra o nome de
      // exibição, não expõe `apelido` bruto (não editável nesta tela).
      contaBancaria: l.contaBancaria ? { id: l.contaBancaria.id, nome: l.contaBancaria.apelido || l.contaBancaria.nome, tipo: l.contaBancaria.tipo } : null,
      empreendimento: property?.nome ?? null,
      unidade: uh?.numero ?? null,
      status: calcularStatusLancamento({ contaTipo: l.contaBancaria?.tipo, pago: l.pago, dataVencimento: l.dataVencimento, hoje }),
      saldo: saldoPorId.get(l.id) ?? null,
    };
  });

  // Período ainda não aplicado (caso de conta selecionada) — filtra agora,
  // já com status/saldo corretos calculados sobre o histórico completo.
  if (inicio && fim && !aplicarPeriodoNaQuery) {
    resposta = resposta.filter((l) =>
      !l.recorrente ? l.dataVencimento >= inicio! && l.dataVencimento <= fim! : l.dataVencimento <= fim! && (!l.recorrenciaFimData || l.recorrenciaFimData >= inicio!)
    );
  }

  return NextResponse.json(resposta);
}

type NovoLancamentoBody = {
  descricao: string;
  fornecedor?: string;
  categoriaId?: string | null;
  tipo: "RECEITA" | "DESPESA";
  valor: number; // magnitude, sempre positivo — o sinal é aplicado aqui a partir de `tipo`
  dataVencimento: string; // YYYY-MM-DD (1ª parcela, se parcelado)
  dataCompetencia?: string | null;
  parcelas?: number; // > 1 = parcelado
  recorrente?: boolean;
  recorrenciaFimData?: string | null;
  contaBancariaId?: string | null;
  centroCustoTipo?: "ADMINISTRACAO" | "EMPREENDIMENTO" | "UNIDADE";
  empreendimentoId?: string | null; // nome do body field mantido (compat com a UI atual) — vira propertyId
  unidadeId?: string | null; // nome do body field mantido (compat com a UI atual) — vira uhId
  observacoes?: string;
};

// Valida e normaliza o Centro de Custo (Administração -> Empreendimento ->
// Unidade, pedido do Felipe, 05/08/2026) a partir do body — usado tanto na
// criação quanto na edição. ADMINISTRACAO é o default (nenhuma FK setada);
// EMPREENDIMENTO exige propertyId (de uma Property do próprio tenant);
// UNIDADE exige uhId (de uma UH do próprio tenant) — em ambos os casos a
// outra FK fica sempre null (nunca as duas setadas juntas).
//
// 06/08/2026 (pedido do Felipe): valida contra Property/UH reais do
// Gateway em vez do antigo cadastro próprio FinanceEmpreendimento/
// FinanceUnidade (removido).
async function resolverCentroCusto(
  tenantId: string,
  centroCustoTipo: string | undefined,
  propertyId: string | null | undefined,
  uhId: string | null | undefined
): Promise<{ ok: true; data: { centroCustoTipo: string; propertyId: string | null; uhId: string | null } } | { ok: false; error: string }> {
  const tipo = centroCustoTipo ?? "ADMINISTRACAO";
  if (!["ADMINISTRACAO", "EMPREENDIMENTO", "UNIDADE"].includes(tipo)) {
    return { ok: false, error: "centroCustoTipo deve ser ADMINISTRACAO, EMPREENDIMENTO ou UNIDADE" };
  }

  if (tipo === "EMPREENDIMENTO") {
    if (!propertyId) return { ok: false, error: "empreendimentoId é obrigatório quando centroCustoTipo=EMPREENDIMENTO" };
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || property.tenantId !== tenantId) return { ok: false, error: "Empreendimento não encontrado" };
    return { ok: true, data: { centroCustoTipo: tipo, propertyId, uhId: null } };
  }

  if (tipo === "UNIDADE") {
    if (!uhId) return { ok: false, error: "unidadeId é obrigatório quando centroCustoTipo=UNIDADE" };
    const uh = await prisma.uH.findUnique({ where: { id: uhId } });
    if (!uh || uh.tenantId !== tenantId) return { ok: false, error: "Unidade não encontrada" };
    return { ok: true, data: { centroCustoTipo: tipo, propertyId: null, uhId } };
  }

  return { ok: true, data: { centroCustoTipo: "ADMINISTRACAO", propertyId: null, uhId: null } };
}

// POST /api/lancamentos — cria um lançamento normal, parcelado ou recorrente
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const body = (await req.json()) as NovoLancamentoBody;
  const { descricao, fornecedor, categoriaId, tipo, valor, dataVencimento, dataCompetencia, parcelas, recorrente, recorrenciaFimData, contaBancariaId, centroCustoTipo, empreendimentoId, unidadeId, observacoes } =
    body;

  if (!descricao?.trim()) return NextResponse.json({ error: "descricao é obrigatória" }, { status: 400 });
  if (tipo !== "RECEITA" && tipo !== "DESPESA") return NextResponse.json({ error: "tipo deve ser RECEITA ou DESPESA" }, { status: 400 });
  if (!valor || valor <= 0) return NextResponse.json({ error: "valor deve ser positivo (o sinal é definido pelo tipo)" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento ?? "")) return NextResponse.json({ error: "dataVencimento inválida (esperado YYYY-MM-DD)" }, { status: 400 });

  const numParcelas = Number(parcelas) || 1;
  if (numParcelas > 1 && recorrente) {
    return NextResponse.json({ error: "um lançamento não pode ser parcelado E recorrente ao mesmo tempo" }, { status: 400 });
  }

  const centroCusto = await resolverCentroCusto(session.tenantId, centroCustoTipo, empreendimentoId, unidadeId);
  if (!centroCusto.ok) return NextResponse.json({ error: centroCusto.error }, { status: centroCusto.error.includes("não encontrad") ? 404 : 400 });

  const sinal = tipo === "DESPESA" ? -1 : 1;

  // Categoria de Receita não pode ir num lançamento de Despesa (nem
  // vice-versa) — pedido do Felipe, 07/08/2026: "O sistema n deve nem
  // permitir categorias de receitas associadas a despesas e vice versa".
  if (categoriaId) {
    const categoria = await prisma.financeCategoria.findUnique({ where: { id: categoriaId } });
    if (!categoria || categoria.tenantId !== session.tenantId) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    try {
      validarCategoriaTipo(categoria, sinal * valor);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }
  const dadosBase = {
    tenantId: session.tenantId,
    categoriaId: categoriaId || null,
    descricao: descricao.trim(),
    fornecedor: fornecedor?.trim() || null,
    dataCompetencia: dataCompetencia || null,
    contaBancariaId: contaBancariaId || null,
    origem: "MANUAL" as const,
    ...centroCusto.data,
    observacoes: observacoes?.trim() || null,
    criadoPorNome: session.nome,
  };

  try {
    if (numParcelas > 1) {
      // Parcelado: divide o valor total em N parcelas (a última absorve o
      // resto do arredondamento pra centavos, pra nunca perder/ganhar
      // centavo na soma), uma linha por mês a partir de dataVencimento.
      const totalCentavos = Math.round(valor * 100);
      const baseCentavos = Math.floor(totalCentavos / numParcelas);
      const restoCentavos = totalCentavos - baseCentavos * numParcelas;
      const parcelaGrupoId = randomUUID();

      const criadas = await prisma.$transaction(
        Array.from({ length: numParcelas }, (_, i) => {
          const centavosDaParcela = baseCentavos + (i === numParcelas - 1 ? restoCentavos : 0);
          return prisma.financeLancamento.create({
            data: {
              ...dadosBase,
              valor: (sinal * centavosDaParcela) / 100,
              dataVencimento: i === 0 ? dataVencimento : somarMeses(dataVencimento, i),
              parcelaGrupoId,
              parcelaNumero: i + 1,
              parcelaTotal: numParcelas,
            },
          });
        })
      );
      return NextResponse.json(criadas, { status: 201 });
    }

    const lancamento = await prisma.financeLancamento.create({
      data: {
        ...dadosBase,
        valor: sinal * valor,
        dataVencimento,
        recorrente: Boolean(recorrente),
        recorrenciaFimData: recorrente ? recorrenciaFimData || null : null,
      },
    });
    return NextResponse.json(lancamento, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/lancamentos — edita um lançamento (categorização é o caso mais
// comum, ver banner de pendentes na tela de DRE; também usado pra
// recorrência, datas, conta e status "pago" via a tela de extrato)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, categoriaId, descricao, fornecedor, valor, tipo, dataVencimento, dataCompetencia, recorrente, recorrenciaFimData, contaBancariaId, pago, centroCustoTipo, empreendimentoId, unidadeId, observacoes } =
    await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeLancamento.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  }

  if (recorrente === true && existente.parcelaGrupoId) {
    return NextResponse.json({ error: "um lançamento parcelado não pode virar recorrente" }, { status: 400 });
  }

  // Centro de custo só é revalidado/atualizado quando algum dos 3 campos
  // vem no body — evita reprocessar em todo PATCH (ex.: só marcar "pago").
  let centroCustoData: { centroCustoTipo: string; propertyId: string | null; uhId: string | null } | undefined;
  if (centroCustoTipo !== undefined || empreendimentoId !== undefined || unidadeId !== undefined) {
    const resolvido = await resolverCentroCusto(session.tenantId, centroCustoTipo ?? existente.centroCustoTipo, empreendimentoId, unidadeId);
    if (!resolvido.ok) return NextResponse.json({ error: resolvido.error }, { status: resolvido.error.includes("não encontrad") ? 404 : 400 });
    centroCustoData = resolvido.data;
  }

  // Se valor OU tipo mudou, recalcula o sinal a partir do tipo informado
  // (ou do sinal atual do lançamento, se tipo não veio no body).
  let novoValor: number | undefined;
  if (valor !== undefined) {
    const sinalAtual = Number(existente.valor) < 0 ? -1 : 1;
    const sinal = tipo === "RECEITA" ? 1 : tipo === "DESPESA" ? -1 : sinalAtual;
    novoValor = sinal * Math.abs(Number(valor));
  }

  // Categoria de Receita não pode ir num lançamento de Despesa (nem
  // vice-versa) — pedido do Felipe, 07/08/2026: "O sistema n deve nem
  // permitir categorias de receitas associadas a despesas e vice versa". Só
  // revalida quando a categoria OU o valor mudou nesse PATCH (evita query
  // extra em todo PATCH irrelevante, ex.: só marcar "pago").
  if (categoriaId !== undefined || novoValor !== undefined) {
    const categoriaIdFinal = categoriaId !== undefined ? categoriaId || null : existente.categoriaId;
    const valorFinal = novoValor !== undefined ? novoValor : Number(existente.valor);
    if (categoriaIdFinal) {
      const categoria = await prisma.financeCategoria.findUnique({ where: { id: categoriaIdFinal } });
      if (!categoria || categoria.tenantId !== session.tenantId) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
      try {
        validarCategoriaTipo(categoria, valorFinal);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }
  }

  try {
    const atualizado = await prisma.financeLancamento.update({
      where: { id },
      data: {
        ...(categoriaId !== undefined ? { categoriaId: categoriaId || null } : {}),
        ...(descricao !== undefined ? { descricao: descricao.trim() } : {}),
        ...(fornecedor !== undefined ? { fornecedor: fornecedor?.trim() || null } : {}),
        ...(novoValor !== undefined ? { valor: novoValor } : {}),
        ...(dataVencimento !== undefined ? { dataVencimento } : {}),
        ...(dataCompetencia !== undefined ? { dataCompetencia: dataCompetencia || null } : {}),
        ...(recorrente !== undefined ? { recorrente: Boolean(recorrente) } : {}),
        ...(recorrenciaFimData !== undefined ? { recorrenciaFimData: recorrenciaFimData || null } : {}),
        ...(contaBancariaId !== undefined ? { contaBancariaId: contaBancariaId || null } : {}),
        ...(pago !== undefined ? { pago: Boolean(pago) } : {}),
        ...(centroCustoData ?? {}),
        ...(observacoes !== undefined ? { observacoes: observacoes?.trim() || null } : {}),
      },
    });
    return NextResponse.json(atualizado);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/lancamentos?id=xxx&grupo=1 — grupo=1 apaga todas as parcelas
// da mesma compra (parcelaGrupoId), não só a selecionada.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const grupoInteiro = searchParams.get("grupo") === "1";
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeLancamento.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  }

  if (grupoInteiro && existente.parcelaGrupoId) {
    await prisma.financeLancamento.deleteMany({ where: { tenantId: session.tenantId, parcelaGrupoId: existente.parcelaGrupoId } });
  } else {
    await prisma.financeLancamento.delete({ where: { id } });
  }

  return NextResponse.json({ ok: true });
}
