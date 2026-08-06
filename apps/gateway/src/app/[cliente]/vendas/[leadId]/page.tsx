import { notFound } from "next/navigation";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { formatValorBRL } from "../../../admin/crm/valorFormat";
import { FONTE_OPCOES } from "../../../admin/crm/fonteOpcoes";
import {
  moverEtapaAction,
  marcarGanhoAction,
  marcarPerdidoRapidoAction,
  reabrirLeadAction,
  excluirLeadAction,
  atualizarValorAction,
  atualizarFonteAction,
  atualizarTelefoneAction,
  enviarMensagemVendasAction,
} from "../actions";

// Tela de detalhe de um lead do módulo Vendas (06/08/2026) — versão enxuta
// v1 do equivalente no admin (LeadDetalheConteudo.tsx): sem campos
// personalizados ainda. Chat de WhatsApp incluído (06/08/2026, 2ª rodada)
// já que o Embedded Signup existe agora — versão simples (sem polling
// como o WhatsAppChat.tsx do admin, só recarrega a página no envio; dá pra
// evoluir depois se o volume de mensagens pedir tempo real). Página normal
// (não modal/intercepting route) — simplicidade proposital.
export default async function VendasLeadDetalhe({
  params,
}: {
  params: { cliente: string; leadId: string };
}) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.cliente } });
  if (!tenant) notFound();

  const session = await getSession();
  if (!session || session.tenantId !== tenant.id) notFound();

  const podeAcessar = await hasModuleAccess(session, "SALES");
  if (!podeAcessar) notFound();

  const lead = await prisma.vendasLead.findUnique({
    where: { id: params.leadId },
    include: {
      atividades: { orderBy: { createdAt: "desc" } },
      mensagens: { orderBy: { createdAt: "asc" } },
      stage: true,
    },
  });
  if (!lead || lead.tenantId !== tenant.id) notFound();

  const etapas = await prisma.vendasEtapa.findMany({ where: { tenantId: tenant.id }, orderBy: { ordem: "asc" } });
  const temCanalConectado = !!(await prisma.channelConnection.findUnique({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "WHATSAPP" } },
    select: { id: true },
  }));
  const boundEnviarMensagem = enviarMensagemVendasAction.bind(null, tenant.slug, lead.id);

  const boundMoverEtapa = moverEtapaAction.bind(null, tenant.slug, lead.id);
  const boundMarcarGanho = marcarGanhoAction.bind(null, tenant.slug, lead.id);
  const boundExcluir = excluirLeadAction.bind(null, tenant.slug, lead.id);
  const boundReabrir = reabrirLeadAction.bind(null, tenant.slug, lead.id);
  const boundAtualizarValor = atualizarValorAction.bind(null, tenant.slug, lead.id);
  const boundAtualizarFonte = atualizarFonteAction.bind(null, tenant.slug, lead.id);
  const boundAtualizarTelefone = atualizarTelefoneAction.bind(null, tenant.slug, lead.id);
  const boundMarcarPerdido = marcarPerdidoRapidoAction.bind(null, tenant.slug, lead.id);

  const desfechoLabel = lead.desfecho === "GANHO" ? "Ganho" : lead.desfecho === "PERDIDO" ? "Perdido" : "Aberto";
  const desfechoCor = lead.desfecho === "GANHO" ? "#1a7f37" : lead.desfecho === "PERDIDO" ? "#d70015" : "#6e6e73";

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <a href={`/${tenant.slug}/vendas`} style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
          ← Vendas
        </a>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", margin: "12px 0 4px", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{lead.nome}</h1>
            {lead.empresa && <p style={{ color: "#6e6e73", fontSize: 13, margin: "2px 0 0" }}>{lead.empresa}</p>}
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: desfechoCor,
              background: `${desfechoCor}1a`,
              padding: "3px 10px",
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            {desfechoLabel}
          </span>
        </div>

        {lead.desfecho === "PERDIDO" && lead.motivoPerda && (
          <p style={{ color: "#d70015", fontSize: 13, margin: "0 0 12px" }}>Motivo: {lead.motivoPerda}</p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 20px" }}>
          {lead.desfecho !== "GANHO" && (
            <form action={boundMarcarGanho}>
              <button type="submit" style={btnPrimary("#1a7f37")}>
                ✅ Marcar ganho
              </button>
            </form>
          )}
          {lead.desfecho !== "PERDIDO" && (
            <form action={async (fd: FormData) => { "use server"; await boundMarcarPerdido(String(fd.get("motivo") ?? "")); }} style={{ display: "flex", gap: 6 }}>
              <input name="motivo" placeholder="Motivo da perda (opcional)" style={{ ...inputStyle, minWidth: 180 }} />
              <button type="submit" style={btnPrimary("#d70015")}>
                ❌ Marcar perdido
              </button>
            </form>
          )}
          {lead.desfecho !== "ABERTO" && (
            <form action={boundReabrir}>
              <button type="submit" style={btnSecondary}>
                ↩ Reabrir
              </button>
            </form>
          )}
          <form
            action={async () => {
              "use server";
              await boundExcluir();
            }}
          >
            <button type="submit" style={btnSecondary}>
              🗑 Excluir
            </button>
          </form>
        </div>

        <section style={cardStyle}>
          <h2 style={sectionTitle}>Dados</h2>

          <Campo label="Telefone">
            <form
              action={async (fd: FormData) => {
                "use server";
                await boundAtualizarTelefone(String(fd.get("telefone") ?? ""));
              }}
              style={{ display: "flex", gap: 6 }}
            >
              <input name="telefone" defaultValue={lead.telefone} style={inputStyle} />
              <button type="submit" style={btnSecondary}>
                Salvar
              </button>
            </form>
          </Campo>

          <Campo label="E-mail">
            <p style={valueStyle}>{lead.email || "—"}</p>
          </Campo>

          <Campo label="Valor (R$)">
            <form
              action={async (fd: FormData) => {
                "use server";
                await boundAtualizarValor(String(fd.get("valor") ?? "0"));
              }}
              style={{ display: "flex", gap: 6 }}
            >
              <input name="valor" type="number" min={0} step="0.01" defaultValue={lead.valor} style={inputStyle} />
              <button type="submit" style={btnSecondary}>
                Salvar
              </button>
            </form>
            <p style={{ ...valueStyle, marginTop: 4 }}>{formatValorBRL(lead.valor)}</p>
          </Campo>

          <Campo label="Fonte">
            <form
              action={async (fd: FormData) => {
                "use server";
                await boundAtualizarFonte(String(fd.get("fonte") ?? ""));
              }}
              style={{ display: "flex", gap: 6 }}
            >
              <select name="fonte" defaultValue={lead.fonte} style={inputStyle}>
                {FONTE_OPCOES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button type="submit" style={btnSecondary}>
                Salvar
              </button>
            </form>
          </Campo>

          <Campo label="Etapa">
            <form
              action={async (fd: FormData) => {
                "use server";
                await boundMoverEtapa(String(fd.get("stageId") ?? ""));
              }}
              style={{ display: "flex", gap: 6 }}
            >
              <select name="stageId" defaultValue={lead.stageId ?? ""} style={inputStyle}>
                {etapas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
              <button type="submit" style={btnSecondary}>
                Salvar
              </button>
            </form>
          </Campo>

          {lead.mensagem && (
            <Campo label="Mensagem inicial">
              <p style={valueStyle}>{lead.mensagem}</p>
            </Campo>
          )}
        </section>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>WhatsApp</h2>
          {!temCanalConectado ? (
            <p style={{ color: "#6e6e73", fontSize: 13, margin: 0 }}>
              Nenhum WhatsApp conectado ainda —{" "}
              <a href={`/${tenant.slug}/vendas/canais`} style={{ color: "#0071e3" }}>
                conecta em Canais
              </a>
              .
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: 260, overflowY: "auto" }}>
                {lead.mensagens.length === 0 ? (
                  <p style={{ color: "#a1a1a6", fontSize: 13, margin: 0 }}>Nenhuma mensagem ainda.</p>
                ) : (
                  lead.mensagens.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.direcao === "ENVIADA" ? "flex-end" : "flex-start",
                        background: m.direcao === "ENVIADA" ? "#dcf8c6" : "#f5f5f7",
                        borderRadius: 10,
                        padding: "6px 10px",
                        maxWidth: "80%",
                        fontSize: 13,
                      }}
                    >
                      <p style={{ margin: 0 }}>{m.conteudo}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#6e6e73" }}>
                        {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(m.createdAt)}
                        {m.direcao === "ENVIADA" && ` · ${m.status.toLowerCase()}`}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <form
                action={async (fd: FormData) => {
                  "use server";
                  await boundEnviarMensagem(String(fd.get("texto") ?? ""));
                }}
                style={{ display: "flex", gap: 6 }}
              >
                <input name="texto" placeholder="Escreva uma mensagem..." required style={inputStyle} />
                <button type="submit" style={btnSecondary}>
                  Enviar
                </button>
              </form>
              <p style={{ fontSize: 11, color: "#a1a1a6", margin: "6px 0 0" }}>
                Só funciona até 24h depois da última mensagem do contato (regra da Meta).
              </p>
            </>
          )}
        </section>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Histórico</h2>
          {lead.atividades.length === 0 ? (
            <p style={{ color: "#a1a1a6", fontSize: 13, margin: 0 }}>Nenhuma atividade ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lead.atividades.map((a) => (
                <div key={a.id} style={{ fontSize: 13, borderBottom: "1px solid #f0f0f2", paddingBottom: 8 }}>
                  <p style={{ margin: 0 }}>{a.conteudo}</p>
                  <p style={{ margin: "2px 0 0", color: "#a1a1a6", fontSize: 11 }}>
                    {a.autorNome} ·{" "}
                    {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(a.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 4px" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: "0 0 12px" };

const valueStyle: React.CSSProperties = { fontSize: 13, color: "#1d1d1f", margin: 0 };

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d2d2d7",
  fontSize: 13,
  flex: 1,
};

function btnPrimary(cor: string): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 9,
    border: "none",
    background: cor,
    color: "#fff",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 9,
  border: "1px solid #d2d2d7",
  background: "#fff",
  color: "#1d1d1f",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
