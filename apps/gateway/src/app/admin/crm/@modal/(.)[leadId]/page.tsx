import { Modal } from "../../Modal";
import { LeadDetalheConteudo } from "../../[leadId]/LeadDetalheConteudo";

// Rota interceptadora — (.) captura navegação pro mesmo nível (/admin/crm/*)
// vinda de DENTRO de /admin/crm (ou seja, clique num <Link> do board), e
// mostra o mesmo conteúdo de crm/[leadId]/page.tsx como popup em vez de
// navegar pra página cheia. Acesso direto por URL/refresh ainda cai na
// página cheia normalmente (a interceptação só vale pra navegação client-side).
export default function LeadModal({ params }: { params: { leadId: string } }) {
  return (
    <Modal>
      <LeadDetalheConteudo leadId={params.leadId} />
    </Modal>
  );
}
