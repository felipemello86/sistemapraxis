// Alertas do módulo Financeiro — requisitos 6 e 7 do Felipe (05/08/2026):
//   6. Depois da varredura diária da Pluggy, o sistema deve "provocar"
//      proativamente pra categorizar despesas novas.
//   7. Se algo sair da linha de base (orçamento), gerar alerta. Follow-up
//      de segunda a sexta.
//
// Este arquivo só monta e ENVIA os alertas (push in-app, via
// sendPushToUser) — quem decide QUANDO rodar é o cron de cada app (ver
// apps/financeiro/src/app/api/cron/alertas/route.ts + vercel.json,
// agendado só em dias úteis). Mesmo padrão de dailyReport.ts em
// apps/maintenance: lib pura aqui, gatilho fica na rota de cron do app.

import { prisma } from "../prisma";
import { sendPushToUser } from "../push";
import { calcularDre } from "./dre";

export interface ResumoAlertaFinanceiro {
  tenantId: string;
  mes: string;
  pendentesCategorizacao: number;
  estourosDeOrcamento: { nome: string; blocoId: string; pctConsumido: number }[];
}

/** Calcula a DRE do mês e devolve o que precisa de atenção — sem enviar
 * nada ainda. Separado de `enviarAlertasFinanceiros` pra poder ser testado
 * ou exibido em tela sem disparar push (ex.: reaproveitar num resumo). */
export async function calcularAlertasFinanceiros(tenantId: string, mes: string): Promise<ResumoAlertaFinanceiro> {
  const dre = await calcularDre(tenantId, mes);

  const estourosDeOrcamento: ResumoAlertaFinanceiro["estourosDeOrcamento"] = [];

  for (const bloco of dre.blocos) {
    if (bloco.orcado != null) {
      const orcado = Number(bloco.orcado);
      const pct = orcado > 0 ? (Math.abs(Number(bloco.total)) / orcado) * 100 : 0;
      if (pct > 100) {
        estourosDeOrcamento.push({ nome: bloco.nome, blocoId: bloco.blocoId, pctConsumido: pct });
      }
    }
    for (const cat of bloco.categorias) {
      if (cat.orcado != null) {
        const orcado = Number(cat.orcado);
        const pct = orcado > 0 ? (Math.abs(Number(cat.total)) / orcado) * 100 : 0;
        if (pct > 100) {
          estourosDeOrcamento.push({ nome: cat.nome, blocoId: bloco.blocoId, pctConsumido: pct });
        }
      }
    }
  }

  return {
    tenantId,
    mes,
    pendentesCategorizacao: dre.pendentesCategorizacao.length,
    estourosDeOrcamento,
  };
}

/** Envia push in-app pra quem tem acesso ao módulo FINANCE no tenant
 * (UserModuleAccess) — hoje só o Felipe, mas não hardcoded (mesmo motivo
 * de moduleAccess.ts: escopo real é "quem tem acesso", não uma pessoa
 * fixa). Não envia nada se não houver pendência nem estouro (silêncio é
 * bom sinal — não é pra virar ruído diário). */
export async function enviarAlertasFinanceiros(tenantId: string, mes: string): Promise<ResumoAlertaFinanceiro> {
  const resumo = await calcularAlertasFinanceiros(tenantId, mes);

  if (resumo.pendentesCategorizacao === 0 && resumo.estourosDeOrcamento.length === 0) {
    return resumo;
  }

  const usuariosComAcesso = await prisma.userModuleAccess.findMany({
    where: { module: "FINANCE", enabled: true, user: { tenantId } },
    select: { userId: true },
  });

  const linhas: string[] = [];
  if (resumo.pendentesCategorizacao > 0) {
    linhas.push(`${resumo.pendentesCategorizacao} lançamento${resumo.pendentesCategorizacao > 1 ? "s" : ""} sem categoria`);
  }
  if (resumo.estourosDeOrcamento.length > 0) {
    linhas.push(
      `orçamento estourado em: ${resumo.estourosDeOrcamento.map((e) => `${e.nome} (${e.pctConsumido.toFixed(0)}%)`).join(", ")}`
    );
  }

  await Promise.all(
    usuariosComAcesso.map((u) =>
      sendPushToUser(u.userId, {
        title: "Financeiro — atenção necessária",
        body: linhas.join(" · "),
        data: { module: "FINANCE", mes: resumo.mes },
      })
    )
  );

  return resumo;
}
