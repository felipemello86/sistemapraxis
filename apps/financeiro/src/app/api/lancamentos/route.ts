import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma, limitesDoMes, somarMeses } from "@praxis/core";
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

// GET /api/lancamentos?mes=YYYY-MM&pendentes=1&categoriaId=xxx
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes");
  const pendentes = searchParams.get("pendentes") === "1";
  const categoriaId = searchParams.get("categoriaId");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (pendentes) where.categoriaId = null;
  if (categoriaId) where.categoriaId = categoriaId;

  if (mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return NextResponse.json({ error: `Mês inválido: "${mes}" (esperado YYYY-MM)` }, { status: 400 });
    }
    const { inicio, fim } = limitesDoMes(mes);
    // Lançamentos "reais" do mês (não recorrentes) OU raízes de
    // recorrência já vigentes nesse mês (dataVencimento <= fim do mês,
    // ainda sem ter acabado). Só mostra a LINHA raiz aqui (não projeta
    // ocorrências virtuais) — CRUD só faz sentido em cima de linhas reais.
    where.OR = [
      { recorrente: false, dataVencimento: { gte: inicio, lte: fim } },
      { recorrente: true, dataVencimento: { lte: fim }, OR: [{ recorrenciaFimData: null }, { recorrenciaFimData: { gte: inicio } }] },
    ];
  }

  const lancamentos = await prisma.financeLancamento.findMany({
    where,
    include: { categoria: { select: { nome: true, tipo: true, bloco: { select: { nome: true } } } } },
    orderBy: { dataVencimento: "desc" },
    take: 300,
  });

  // Achata categoria.bloco.nome -> categoria.bloco (string), mesma
  // convenção de /api/categorias — mantém o shape que as telas já esperam.
  const resposta = lancamentos.map((l) => ({
    ...l,
    categoria: l.categoria ? { nome: l.categoria.nome, tipo: l.categoria.tipo, bloco: l.categoria.bloco.nome } : null,
  }));

  return NextResponse.json(resposta);
}

type NovoLancamentoBody = {
  descricao: string;
  fornecedor?: string;
  categoriaId?: string | null;
  tipo: "RECEITA" | "DESPESA";
  valor: number; // magnitude, sempre positivo — o sinal é aplicado aqui a partir de `tipo`
  dataVencimento: string; // YYYY-MM-DD (1ª parcela, se parcelado)
  parcelas?: number; // > 1 = parcelado
  recorrente?: boolean;
  recorrenciaFimData?: string | null;
  centroCusto?: string;
  observacoes?: string;
};

// POST /api/lancamentos — cria um lançamento normal, parcelado ou recorrente
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const body = (await req.json()) as NovoLancamentoBody;
  const { descricao, fornecedor, categoriaId, tipo, valor, dataVencimento, parcelas, recorrente, recorrenciaFimData, centroCusto, observacoes } = body;

  if (!descricao?.trim()) return NextResponse.json({ error: "descricao é obrigatória" }, { status: 400 });
  if (tipo !== "RECEITA" && tipo !== "DESPESA") return NextResponse.json({ error: "tipo deve ser RECEITA ou DESPESA" }, { status: 400 });
  if (!valor || valor <= 0) return NextResponse.json({ error: "valor deve ser positivo (o sinal é definido pelo tipo)" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento ?? "")) return NextResponse.json({ error: "dataVencimento inválida (esperado YYYY-MM-DD)" }, { status: 400 });

  const numParcelas = Number(parcelas) || 1;
  if (numParcelas > 1 && recorrente) {
    return NextResponse.json({ error: "um lançamento não pode ser parcelado E recorrente ao mesmo tempo" }, { status: 400 });
  }

  const sinal = tipo === "DESPESA" ? -1 : 1;
  const dadosBase = {
    tenantId: session.tenantId,
    categoriaId: categoriaId || null,
    descricao: descricao.trim(),
    fornecedor: fornecedor?.trim() || null,
    origem: "MANUAL" as const,
    centroCusto: centroCusto?.trim() || null,
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
// comum, ver banner de pendentes na tela de DRE)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, categoriaId, descricao, fornecedor, valor, tipo, dataVencimento, recorrenciaFimData, centroCusto, observacoes } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeLancamento.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  }

  // Se valor OU tipo mudou, recalcula o sinal a partir do tipo informado
  // (ou do sinal atual do lançamento, se tipo não veio no body).
  let novoValor: number | undefined;
  if (valor !== undefined) {
    const sinalAtual = Number(existente.valor) < 0 ? -1 : 1;
    const sinal = tipo === "RECEITA" ? 1 : tipo === "DESPESA" ? -1 : sinalAtual;
    novoValor = sinal * Math.abs(Number(valor));
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
        ...(recorrenciaFimData !== undefined ? { recorrenciaFimData: recorrenciaFimData || null } : {}),
        ...(centroCusto !== undefined ? { centroCusto: centroCusto?.trim() || null } : {}),
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
