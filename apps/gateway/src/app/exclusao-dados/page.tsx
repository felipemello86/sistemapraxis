// Exclusão de Dados — página estática, pública (sem gate de sessão), exigida
// pela Meta (App Review do WhatsApp Embedded Signup, 06/08/2026) como URL de
// "Data Deletion" e também recomendada pela Google Play Console. Mesmo
// padrão/estilo de app/privacidade/page.tsx. Não é aconselhamento jurídico:
// revisar (idealmente com um advogado, por causa da LGPD) antes de publicar.

export const metadata = {
  title: "Exclusão de Dados — Praxis",
};

const SECTION_STYLE: React.CSSProperties = { marginTop: 28 };
const H2_STYLE: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 };
const P_STYLE: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, color: "#3a3a3c", margin: 0 };
const LI_STYLE: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, color: "#3a3a3c", marginBottom: 6 };

export default function ExclusaoDadosPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1d1d1f", marginBottom: 4 }}>
        Exclusão de Dados — Praxis
      </h1>
      <p style={{ fontSize: 14, color: "#86868b", marginBottom: 0 }}>
        Última atualização: 6 de agosto de 2026
      </p>

      <div style={SECTION_STYLE}>
        <p style={P_STYLE}>
          O Praxis é um sistema interno de gestão hoteleira. Contas de usuário são criadas e
          gerenciadas pelo estabelecimento (tenant) contratante — por isso, pedidos de exclusão
          de dados são tratados diretamente com a gente, sem um fluxo de autoatendimento, para
          garantir que a exclusão não afete indevidamente o histórico operacional de outros
          usuários do mesmo estabelecimento.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Como pedir a exclusão dos seus dados</h2>
        <p style={P_STYLE}>
          Envie um e-mail para <strong>felipe_mello86@hotmail.com</strong> a partir do endereço
          vinculado à sua conta, informando seu nome completo e o estabelecimento (tenant) ao qual
          você está vinculado. Respondemos e confirmamos a exclusão em até 15 dias corridos.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>O que é excluído</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={LI_STYLE}>Seus dados de conta: nome, nome de usuário, cargo/função.</li>
          <li style={LI_STYLE}>
            Identificadores técnicos vinculados a você: token de notificação push e, se aplicável,
            o identificador de chat do Telegram.
          </li>
          <li style={LI_STYLE}>
            Dados de conexão do WhatsApp Business (quando aplicável): token de acesso da conta
            conectada por um tenant é revogado e removido do nosso banco de dados.
          </li>
        </ul>
        <p style={{ ...P_STYLE, marginTop: 10 }}>
          Registros operacionais gerados pelo uso do sistema (ex.: eventos de limpeza, itens de
          manutenção, avaliações, movimentações de estoque, mensagens trocadas com hóspedes/leads)
          pertencem ao estabelecimento contratante e podem ser mantidos como parte do histórico
          operacional do tenant, mesmo após a exclusão da sua conta individual — nesse caso, seu
          vínculo de autoria é removido ou anonimizado.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Exclusão de dados do WhatsApp Business</h2>
        <p style={P_STYLE}>
          Se seu estabelecimento conectou um número de WhatsApp Business ao Praxis via Embedded
          Signup da Meta, você pode desconectá-lo a qualquer momento em Vendas → Canais, dentro do
          próprio sistema. Isso revoga nosso acesso ao token dessa conta imediatamente. Para excluir
          também o histórico de mensagens armazenado, use o pedido de exclusão acima.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Contato</h2>
        <p style={P_STYLE}>
          Dúvidas sobre exclusão de dados: <strong>felipe_mello86@hotmail.com</strong>
        </p>
      </div>
    </main>
  );
}
