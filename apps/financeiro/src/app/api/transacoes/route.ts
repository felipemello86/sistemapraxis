import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  hasModuleAccess,
  listarExecucoes,
  confirmarValorGerente,
  confirmarPagamentoMaster,
  rejeitarExecucao,
  type StatusTransacaoExecucao,
} from "@praxis/core";

// Tela de TRANSAÇÕES (pedido do Felipe, 07/08/2026) — fila de aprovação
// das execuções mensais geradas pelo cron a partir das regras cadastradas
// em /api/transacoes-automatizadas. Ver comentário completo do fluxo em
// lib/finance/transacoes-automatizadas.ts.

// GET /api/transacoes?status=AGUARDANDO_GERENTE,AGUARDANDO_MASTER
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const statusParam = new URL(req.url).searchParams.get("status");
  const status = statusParam ? (statusParam.split(",") as StatusTransacaoExecucao[]) : undefined;

  const execucoes = await listarExecucoes(session.tenantId, status);
  return NextResponse.json(execucoes);
}

// PATCH /api/transacoes — { id, acao: "confirmar-gerente" | "confirmar-master" | "rejeitar", valorConfirmado?, motivo? }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, acao, valorConfirmado, motivo } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  try {
    if (acao === "confirmar-gerente") {
      // GERENTE confirma o valor — Master também pode, na ausência dele
      // (é uma aprovação a mais na cadeia, não uma restrição de acesso).
      if (session.role !== "GERENTE" && session.role !== "MASTER") {
        return NextResponse.json({ error: "Só os perfis Gerente ou Master podem confirmar o valor" }, { status: 403 });
      }
      await confirmarValorGerente(session.tenantId, id, session.nome, Number(valorConfirmado));
      return NextResponse.json({ ok: true });
    }

    if (acao === "confirmar-master") {
      // Etapa final — representa "eu, titular da conta, efetuei o
      // pagamento": não é delegável a nenhum outro perfil.
      if (session.role !== "MASTER") {
        return NextResponse.json({ error: "Só o perfil Master pode confirmar o pagamento" }, { status: 403 });
      }
      await confirmarPagamentoMaster(session.tenantId, id, session.nome);
      return NextResponse.json({ ok: true });
    }

    if (acao === "rejeitar") {
      if (session.role !== "GERENTE" && session.role !== "MASTER") {
        return NextResponse.json({ error: "Só os perfis Gerente ou Master podem rejeitar" }, { status: 403 });
      }
      await rejeitarExecucao(session.tenantId, id, session.nome, motivo);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'acao deve ser "confirmar-gerente", "confirmar-master" ou "rejeitar"' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
