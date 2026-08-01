import { notFound } from "next/navigation";
import { getAdminSession, prisma } from "@praxis/core";
import { garantirCrmPronto } from "../data";
import { FonteSelect } from "./FonteSelect";
import { ParceiroSelect } from "./ParceiroSelect";
import { ValorInput } from "./ValorInput";
import { LeadInfoEditavel } from "./LeadInfoEditavel";
import { NotaForm } from "./NotaForm";
import { PerdidoForm } from "./PerdidoForm";
import { CamposPersonalizadosForm } from "./CamposPersonalizadosForm";
import { ExcluirLeadButton } from "./ExcluirLeadButton";
import { WhatsAppChat } from "./WhatsAppChat";
import {
  moverEtapaDetalheAction,
  atualizarFonteAction,
  atualizarValorAction,
  atualizarTelefoneAction,
  atualizarDadosLeadAction,
  atualizarParceiroAction,
  criarNotaAction,
  marcarPerdidoAction,
  marcarGanhoDetalheAction,
  reabrirLeadDetalheAction,
  salvarCamposLeadAction,
  excluirLeadAction,
  enviarMensagemWhatsAppAction,
} from "../../actions";

const TIPO_LABEL: Record<string, string> = {
  NOTA: "Nota",
  MUDANCA_ETAPA: "Etapa",
  MENSAGEM: "Mensagem",
};

// Conteúdo em si da tela de um lead — sem <main>/wrapper de página, pra
// poder ser reusado tanto na página cheia (crm/[leadId]/page.tsx, acessada
// direto por URL/refresh) quanto no popup (crm/@modal/(.)[leadId]/page.tsx,
// que intercepta a navegação vinda de dentro do board). Ver crm/layout.tsx.
export async function LeadDetalheConteudo({ leadId }: { leadId: string }) {
  const admin = await getAdminSession();
  if (!admin) return null; // já tratado com redirect nas duas páginas que chamam isso

  await garantirCrmPronto();

  const [lead, etapas, campos, parceiros] = await Promise.all([
    prisma.demoLead.findUnique({
      where: { id: leadId },
      include: {
        stage: true,
        atividades: { orderBy: { createdAt: "desc" } },
        camposPersonalizados: true,
        whatsappMensagens: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.pipelineStage.findMany({ orderBy: { ordem: "asc" } }),
    prisma.leadCampoPersonalizado.findMany({ orderBy: { ordem: "asc" } }),
    prisma.crmParceiro.findMany({ orderBy: { nome: "asc" } }),
  ]);

  if (!lead) notFound();

  const marcarPerdidoComId = marcarPerdidoAction.bind(null, lead.id);
  const marcarGanhoComId = marcarGanhoDetalheAction.bind(null, lead.id);
  const reabrirComId = reabrirLeadDetalheAction.bind(null, lead.id);
  const criarNotaComId = criarNotaAction.bind(null, lead.id);
  const salvarCamposComId = salvarCamposLeadAction.bind(null, lead.id);
  const excluirComId = excluirLeadAction.bind(null, lead.id);
  const valoresCampos = Object.fromEntries(lead.camposPersonalizados.map((v) => [v.campoId, v.valor]));
  // Date não serializa 1:1 pro client component do jeito que a API de
  // polling devolve (JSON.stringify vira ISO string) — normaliza aqui pra o
  // shape inicial ficar idêntico ao que o polling traz depois.
  const mensagensWhatsApp = lead.whatsappMensagens.map((m) => ({
    id: m.id,
    direcao: m.direcao,
    conteudo: m.conteudo,
    tipo: m.tipo,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  }));

  const botaoAcaoStyle: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 9,
    border: "1px solid #d2d2d7",
    background: "#fff",
    color: "#1d1d1f",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <>
      <div style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
        <LeadInfoEditavel
          leadId={lead.id}
          hotelAtual={lead.hotel}
          nomeAtual={lead.nome}
          emailAtual={lead.email ?? ""}
          mensagemAtual={lead.mensagem ?? ""}
          telefoneAtual={lead.telefone}
          criadoEmLabel={lead.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          etapaAtualId={lead.stageId}
          etapas={etapas}
          moverEtapaAction={moverEtapaDetalheAction}
          atualizarTelefoneAction={atualizarTelefoneAction}
          atualizarDadosAction={atualizarDadosLeadAction}
        />

        {lead.desfecho === "GANHO" && (
          <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "#1a7f37" }}>✅ Lead ganho</p>
        )}
        {lead.desfecho === "PERDIDO" && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#d70015" }}>
            <strong>❌ Lead perdido.</strong>
            {lead.motivoPerda ? ` Motivo: ${lead.motivoPerda}` : ""}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6e6e73" }}>Valor (R$):</span>
          <ValorInput leadId={lead.id} valorAtual={lead.valor} action={atualizarValorAction} />
          <span style={{ fontSize: 13, color: "#6e6e73" }}>Fonte:</span>
          <FonteSelect leadId={lead.id} fonteAtual={lead.fonte} action={atualizarFonteAction} />
          {lead.fonte === "Indicação" && (
            <>
              <span style={{ fontSize: 13, color: "#6e6e73" }}>Parceiro:</span>
              <ParceiroSelect
                leadId={lead.id}
                parceiroIdAtual={lead.parceiroId}
                parceiros={parceiros}
                action={atualizarParceiroAction}
              />
            </>
          )}
          {lead.desfecho === "ABERTO" && (
            <>
              <form action={marcarGanhoComId}>
                <button type="submit" style={botaoAcaoStyle}>✅ Marcar ganho</button>
              </form>
              <PerdidoForm action={marcarPerdidoComId} />
            </>
          )}
          {lead.desfecho !== "ABERTO" && (
            <form action={reabrirComId}>
              <button type="submit" style={botaoAcaoStyle}>↩ Reabrir</button>
            </form>
          )}
          <ExcluirLeadButton nomeHotel={lead.hotel} action={excluirComId} />
        </div>
      </div>

      {campos.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 20, marginTop: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Campos personalizados</h2>
            <a href="/admin/crm/campos" style={{ fontSize: 12, color: "#0071e3", textDecoration: "none" }}>
              Gerenciar
            </a>
          </div>
          <CamposPersonalizadosForm campos={campos} valores={valoresCampos} action={salvarCamposComId} />
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 14, padding: 20, marginTop: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>WhatsApp</h2>
        <WhatsAppChat leadId={lead.id} mensagensIniciais={mensagensWhatsApp} action={enviarMensagemWhatsAppAction} />
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 20, marginTop: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Adicionar nota</h2>
        <NotaForm action={criarNotaComId} />
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 20, marginTop: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Histórico ({lead.atividades.length})</h2>
        {lead.atividades.length === 0 && (
          <p style={{ color: "#6e6e73", fontSize: 13 }}>Nenhuma atividade registrada ainda.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lead.atividades.map((a) => (
            <div key={a.id} style={{ borderLeft: "2px solid #d2d2d7", paddingLeft: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "#6e6e73",
                    background: "#f5f5f7",
                    padding: "2px 7px",
                    borderRadius: 999,
                  }}
                >
                  {TIPO_LABEL[a.tipo] ?? a.tipo}
                </span>
                <span style={{ fontSize: 11.5, color: "#a1a1a6" }}>
                  {a.autorNome} · {a.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#1d1d1f", whiteSpace: "pre-wrap" }}>
                {a.conteudo}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
