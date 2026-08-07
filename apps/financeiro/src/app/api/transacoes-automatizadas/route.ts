import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, listarTransacoesAutomatizadas, criarTransacaoAutomatizada, atualizarTransacaoAutomatizada } from "@praxis/core";

// CRUD das REGRAS de Transação Automatizada (pedido do Felipe, 07/08/2026)
// — o cadastro ("todo dia 1º pagar R$468 pro Jurandir") em si, separado
// das execuções mensais/aprovações (ver /api/transacoes). Cadastro
// restrito a MASTER: envolve dados bancários de terceiros e define de onde
// sai o dinheiro — mesmo espírito de "titular da conta" do pedido
// original. GET fica aberto a qualquer um com acesso ao módulo (GERENTE
// precisa ver a regra por trás de cada pendência que vai confirmar).

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const regras = await listarTransacoesAutomatizadas(session.tenantId);
  return NextResponse.json(regras);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (session.role !== "MASTER") {
    return NextResponse.json({ error: "Só o perfil Master pode cadastrar Transações Automatizadas" }, { status: 403 });
  }

  const body = await req.json();
  try {
    const regra = await criarTransacaoAutomatizada(session.tenantId, body, session.nome);
    return NextResponse.json(regra, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// PATCH /api/transacoes-automatizadas — { id, ...campos, ativo? }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (session.role !== "MASTER") {
    return NextResponse.json({ error: "Só o perfil Master pode editar Transações Automatizadas" }, { status: 403 });
  }

  const { id, ...dados } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  try {
    const regra = await atualizarTransacaoAutomatizada(session.tenantId, id, dados);
    return NextResponse.json(regra);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
