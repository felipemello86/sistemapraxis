import { redirect } from "next/navigation";

// Removida (pedido do Felipe, 06/08/2026): Empreendimento/Unidade não são
// mais um cadastro próprio do Financeiro — o cadastro (criar/editar/
// desativar/excluir) passou a ser feito só em Gateway > Configurações >
// Unidades. Esta rota fica só como redirect — os arquivos deste diretório
// (page.tsx, CentrosDeCustoView.tsx) não puderam ser apagados pela
// sandbox (EPERM); Felipe pode `git rm -r` a pasta
// apps/financeiro/src/app/configuracoes/centros-de-custo manualmente.
export default function CentrosDeCustoPage() {
  redirect("/configuracoes");
}
