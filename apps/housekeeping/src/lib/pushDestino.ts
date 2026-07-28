// Deep link de notificação push — pra onde levar a pessoa quando ela toca
// numa notificação, de acordo com o `data` que o servidor mandou (ver
// notify.ts em @praxis/core: sempre `{ tipo, ... }` ou, num punhado de casos
// mais novos, `{ view }`). Antes disso só existia deep link pra "fim_dia";
// todo o resto abria o app na tela padrão, ignorando o conteúdo da
// notificação — pedido explícito do Felipe pra corrigir isso.
//
// Existe uma cópia quase idêntica desta função em apps/gateway e
// apps/maintenance (mesmo padrão de pequena duplicação já usado no resto da
// suíte pra evitar acoplar apps que só se falam via URL/HTTP, nunca via
// import direto — cada deploy Vercel é independente). Se um novo tipo de
// notificação for criado em qualquer app, adicionar o caso aqui E nos outros
// dois arquivos.
export type DestinoNotificacao = { modulo: "governance" | "upkeep"; caminho: string };

export function resolverDestinoNotificacao(
  data: Record<string, string> | undefined | null,
): DestinoNotificacao | null {
  if (!data) return null;

  // Maioria das notificações do Housekeeping usa `tipo` (ver notify() calls
  // em apps/housekeeping/src/app/api/**).
  switch (data.tipo) {
    // UH entrou na lista da camareira (nova atribuição, liberada pra
    // limpeza, ou decisão sobre uma troca que ela pediu) — "Minhas UHs".
    case "atribuicao":
    case "quarto_liberado":
    case "liberacao":
    case "decisao_alteracao":
    case "inspecao_finalizada":
      return { modulo: "governance", caminho: "/camareira" };

    // Governanta/Gerente precisa agir sobre atribuições do dia.
    case "atribuicoes_dia":
    case "solicitacao_alteracao":
      return { modulo: "governance", caminho: "/atribuicao" };

    // Mudança de estado de bloqueio/liberação de UH — decidida em Seleção e
    // Liberação.
    case "liberacao_desfeita":
    case "desbloqueio":
    case "bloqueio":
      return { modulo: "governance", caminho: "/selecao" };

    // UH pronta pra Governanta ir inspecionar.
    case "sessao_finalizada":
      return { modulo: "governance", caminho: "/governanta" };

    // Sem tela dedicada — mora na aba "Lavanderia" de Movimentos.
    case "falha_lavanderia":
      return { modulo: "governance", caminho: "/movimentos?aba=lavanderia" };

    // Único tipo com deep link antes desta feature.
    case "fim_dia":
      return { modulo: "governance", caminho: "/relatorios" };
  }

  // Um punhado de notificações mais novas (Manutenção, Falhas Gerenciais)
  // usa `view` em vez de `tipo` — ver notify() calls com `data: { view: ... }`.
  switch (data.view) {
    case "selecao":
      return { modulo: "governance", caminho: "/selecao" };
    case "falhas-gerenciais":
      return { modulo: "governance", caminho: "/falhas-gerenciais" };
    // Telas do Manutenção são uma SPA de aba única (ver ViewId em
    // apps/maintenance/src/lib/types.ts) — a aba inicial vem de ?view= na
    // URL (ver dashboard.tsx, useSearchParams).
    case "correcao":
      return { modulo: "upkeep", caminho: "/?view=correcao" };
    case "performance":
      return { modulo: "upkeep", caminho: "/?view=performance" };
  }

  return null;
}
