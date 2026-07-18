// Política de Privacidade — página estática, pública (sem gate de sessão),
// exigida pela Google Play Console mesmo pra apps de uso interno/corporativo
// (link obrigatório na ficha da loja). Texto redigido a partir do que o
// sistema Praxis realmente coleta/processa — ver módulos Governança,
// Manutenção, Avaliações e Estoque. Não é aconselhamento jurídico: revisar
// (idealmente com um advogado, por causa da LGPD) antes de publicar.

export const metadata = {
  title: "Política de Privacidade — Praxis",
};

const SECTION_STYLE: React.CSSProperties = { marginTop: 28 };
const H2_STYLE: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 };
const P_STYLE: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, color: "#3a3a3c", margin: 0 };
const LI_STYLE: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, color: "#3a3a3c", marginBottom: 6 };

export default function PoliticaPrivacidadePage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1d1d1f", marginBottom: 4 }}>
        Política de Privacidade — Praxis
      </h1>
      <p style={{ fontSize: 14, color: "#86868b", marginBottom: 0 }}>
        Última atualização: 18 de julho de 2026
      </p>

      <div style={SECTION_STYLE}>
        <p style={P_STYLE}>
          O Praxis é um sistema interno de gestão hoteleira, usado por funcionários e gestores de
          hotéis e pousadas para operar os módulos de Governança (limpeza de unidades),
          Manutenção, Avaliações de hóspedes e Estoque. O acesso é restrito a pessoas autorizadas
          pelo estabelecimento contratante — não é um aplicativo de uso público.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Quais dados coletamos</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={LI_STYLE}>
            <strong>Dados de conta:</strong> nome, nome de usuário, cargo/função e o
            estabelecimento (tenant) ao qual você está vinculado.
          </li>
          <li style={LI_STYLE}>
            <strong>Dados operacionais:</strong> registros gerados pelo uso do sistema — eventos de
            limpeza de unidades, inspeções, itens de manutenção, avaliações de hóspedes e comentários,
            movimentações de estoque.
          </li>
          <li style={LI_STYLE}>
            <strong>Notificações push:</strong> um identificador técnico do dispositivo (token),
            usado só para entregar alertas do sistema (ex.: nova avaliação, estoque baixo).
          </li>
          <li style={LI_STYLE}>
            <strong>Telegram (opcional):</strong> se você mesmo vincular seu usuário a um chat do
            Telegram, guardamos esse identificador de chat pra enviar alertas de estoque baixo.
          </li>
        </ul>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Como usamos esses dados</h2>
        <p style={P_STYLE}>
          Usamos os dados exclusivamente para operar o sistema: autenticar seu acesso, registrar e
          exibir as informações operacionais do seu estabelecimento, e enviar as notificações que
          você (ou seu gestor) configurou. Não vendemos nem compartilhamos seus dados com terceiros
          para fins de publicidade.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Serviços de terceiros que usamos</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={LI_STYLE}>
            <strong>Firebase Cloud Messaging (Google):</strong> entrega de notificações push.
          </li>
          <li style={LI_STYLE}>
            <strong>Telegram Bot API:</strong> envio de alertas de estoque, só pra quem vincular o
            próprio usuário voluntariamente.
          </li>
          <li style={LI_STYLE}>
            <strong>Cloudinary:</strong> armazenamento de fotos anexadas em avaliações/manutenção.
          </li>
          <li style={LI_STYLE}>
            <strong>Neon (banco de dados PostgreSQL) e Vercel:</strong> hospedagem da aplicação e do
            banco de dados.
          </li>
        </ul>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Retenção e segurança</h2>
        <p style={P_STYLE}>
          Os dados ficam armazenados enquanto sua conta e a do estabelecimento estiverem ativas no
          sistema. O acesso é restrito por login e por permissão de módulo — cada pessoa só vê os
          dados do estabelecimento (tenant) ao qual pertence.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Seus direitos</h2>
        <p style={P_STYLE}>
          Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento, entrando
          em contato pelo e-mail abaixo. Contas e usuários são gerenciados pelo administrador do seu
          estabelecimento.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h2 style={H2_STYLE}>Contato</h2>
        <p style={P_STYLE}>
          Dúvidas sobre esta política ou sobre seus dados: <strong>felipe_mello86@hotmail.com</strong>
        </p>
      </div>
    </main>
  );
}
