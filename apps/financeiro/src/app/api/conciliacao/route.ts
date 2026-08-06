import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  hasModuleAccess,
  sugerirConciliacao,
  listarPendentesDeConciliacao,
  confirmarConciliacao,
  marcarComoDiverso,
  desfazerConciliacao,
  criarEConciliar,
  type NovoLancamentoConciliacao,
} from "@praxis/core";

// Conciliação (pedido do Felipe, 06/08/2026): pareia um lançamento
// importado (extrato/fatura) com o lançamento previsto que ele cumpre, ou
// marca como "Lançamento Diverso" quando não há previsão específica. Toda
// a lógica de sugestão/matching vive em lib/finance/conciliacao.ts.

// GET /api/conciliacao?lancamentoId=xxx — sugestões pra UM lançamento (usado
// pelo ícone de conciliação na tela de Lançamentos).
// GET /api/conciliacao?mes=YYYY-MM (opcional) — lista em lote todos os
// lançamentos PLUGGY ainda pendentes de conciliação, cada um já com sua(s)
// sugestão(ões) (usado pela tela /conciliacoes).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const lancamentoId = searchParams.get("lancamentoId");
  const mes = searchParams.get("mes");

  if (lancamentoId) {
    const sugestoes = await sugerirConciliacao(session.tenantId, lancamentoId);
    return NextResponse.json({ sugestoes });
  }

  if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: `Mês inválido: "${mes}" (esperado YYYY-MM)` }, { status: 400 });
  }

  const pendentes = await listarPendentesDeConciliacao(session.tenantId, mes || undefined);
  return NextResponse.json(pendentes);
}

type ConfirmacaoBody = { lancamentoId: string; previstoId: string; mesReferencia: string };
type LoteItemBody =
  | { lancamentoId: string; previstoId: string; mesReferencia: string; novo?: undefined }
  | { lancamentoId: string; novo: NovoLancamentoConciliacao; previstoId?: undefined; mesReferencia?: undefined };

// POST /api/conciliacao — 6 formatos de body, conforme a ação:
//   { lancamentoId, previstoId, mesReferencia } — confirma match com um previsto específico
//   { lancamentoId, diverso: true }             — marca "Lançamento Diverso"
//   { lancamentoId, desfazer: true }             — desfaz (volta a pendente)
//   { confirmacoes: [{ lancamentoId, previstoId, mesReferencia }, ...] }  — confirma vários de uma vez (tela /conciliacoes)
//   { lancamentoId, novo: {...} }                — cria um previsto novo e já concilia (card
//                                                   "Novo lançamento" do redesign de 06/08/2026, ver criarEConciliar)
//   { lote: [{ lancamentoId, previstoId, mesReferencia } | { lancamentoId, novo: {...} }, ...] } —
//                                                   conciliação em lote MISTA (pedido do Felipe, 06/08/2026: tela
//                                                   de Conciliações com card compacto + checkbox por lançamento,
//                                                   "Conciliar selecionados" processa previstos E novos lançamentos
//                                                   numa chamada só). Igual a `confirmacoes`, mas aceita os dois
//                                                   formatos misturados no mesmo array.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const body = await req.json();

  try {
    if (Array.isArray(body.confirmacoes)) {
      const confirmacoes = body.confirmacoes as ConfirmacaoBody[];
      let ok = 0;
      const erros: { lancamentoId: string; error: string }[] = [];
      for (const c of confirmacoes) {
        try {
          await confirmarConciliacao(session.tenantId, c.lancamentoId, c.previstoId, c.mesReferencia);
          ok++;
        } catch (e: any) {
          erros.push({ lancamentoId: c.lancamentoId, error: e.message });
        }
      }
      return NextResponse.json({ ok, total: confirmacoes.length, erros });
    }

    if (Array.isArray(body.lote)) {
      const lote = body.lote as LoteItemBody[];
      let ok = 0;
      const erros: { lancamentoId: string; error: string }[] = [];
      for (const item of lote) {
        try {
          if (item.novo) {
            await criarEConciliar(session.tenantId, item.lancamentoId, item.novo);
          } else {
            await confirmarConciliacao(session.tenantId, item.lancamentoId, item.previstoId, item.mesReferencia);
          }
          ok++;
        } catch (e: any) {
          erros.push({ lancamentoId: item.lancamentoId, error: e.message });
        }
      }
      return NextResponse.json({ ok, total: lote.length, erros });
    }

    const { lancamentoId, previstoId, mesReferencia, diverso, desfazer, novo } = body;
    if (!lancamentoId) return NextResponse.json({ error: "lancamentoId obrigatório" }, { status: 400 });

    if (desfazer) {
      const atualizado = await desfazerConciliacao(session.tenantId, lancamentoId);
      return NextResponse.json(atualizado);
    }
    if (diverso) {
      const atualizado = await marcarComoDiverso(session.tenantId, lancamentoId);
      return NextResponse.json(atualizado);
    }
    if (novo) {
      const previsto = await criarEConciliar(session.tenantId, lancamentoId, novo as NovoLancamentoConciliacao);
      return NextResponse.json(previsto, { status: 201 });
    }
    if (!previstoId || !mesReferencia) {
      return NextResponse.json({ error: "previstoId e mesReferencia são obrigatórios pra confirmar uma conciliação" }, { status: 400 });
    }
    const atualizado = await confirmarConciliacao(session.tenantId, lancamentoId, previstoId, mesReferencia);
    return NextResponse.json(atualizado);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
