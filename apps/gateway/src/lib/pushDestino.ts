// Deep link de notificação push — pra onde levar a pessoa quando ela toca
// numa notificação, de acordo com o `data` que o servidor mandou (ver
// notify.ts em @praxis/core: sempre `{ tipo, ... }` ou, num punhado de casos
// mais novos, `{ view }`). Antes disso só existia deep link pra "fim_dia";
// todo o resto abria o app na tela padrão (o hub), ignorando o conteúdo da
// notificação — pedido explícito do Felipe pra corrigir isso.
//
// Existe uma cópia quase idêntica desta função em apps/housekeeping e
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

  switch (data.tipo) {
    case "atribuicao":
    case "quarto_liberado":
    case "liberacao":
    case "decisao_alteracao":
    case "inspecao_finalizada":
      return { modulo: "governance", caminho: "/camareira" };
    case "atribuicoes_dia":
    case "solicitacao_alteracao":
      return { modulo: "governance", caminho: "/atribuicao" };
    case "liberacao_desfeita":
    case "desbloqueio":
    case "bloqueio":
      return { modulo: "governance", caminho: "/selecao" };
    case "sessao_finalizada":
      return { modulo: "governance", caminho: "/governanta" };
    case "falha_lavanderia":
      return { modulo: "governance", caminho: "/movimentos?aba=lavanderia" };
    case "fim_dia":
      return { modulo: "governance", caminho: "/relatorios" };
  }

  switch (data.view) {
    case "selecao":
      return { modulo: "governance", caminho: "/selecao" };
    case "falhas-gerenciais":
      return { modulo: "governance", caminho: "/falhas-gerenciais" };
    // NC urgente / solicitação de manutenção pendente de decisão (ver
    // aplicarBloqueioPorUrgencia/criarSolicitacaoManutencao em
    // packages/core/src/maintenanceUrgente.ts) — pedido do Felipe,
    // 05/08/2026.
    case "decisao-bloqueio":
      return { modulo: "governance", caminho: "/decisao-bloqueio" };
    case "correcao":
      return { modulo: "upkeep", caminho: "/?view=correcao" };
    case "performance":
      return { modulo: "upkeep", caminho: "/?view=performance" };
    case "informacoes":
      return { modulo: "upkeep", caminho: "/?view=informacoes" };
  }

  return null;
}
