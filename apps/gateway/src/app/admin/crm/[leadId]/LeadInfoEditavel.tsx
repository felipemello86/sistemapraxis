"use client";

import { useState } from "react";
import { EtapaSelect } from "../EtapaSelect";
import { TelefoneInput } from "./TelefoneInput";

// SVG inline em vez de emoji (pedido do Felipe, 31/07/2026: "o botão do
// lápis deve ser um ícone e não um emoji") — mesmo traçado do IconeLapis em
// ParceirosSection.tsx, duplicado aqui pelo mesmo motivo (evitar acoplar os
// dois arquivos por causa de um ícone).
function IconeLapis() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// Cabeçalho + dados de contato do lead (hotel, nome, e-mail, mensagem) —
// antes só Telefone/Valor/Fonte/Etapa eram editáveis (auto-save no
// onBlur/onChange); hotel/nome/email/mensagem ficavam só texto fixo. Pedido
// do Felipe (31/07/2026): "os leads precisam ser editáveis... acho que a
// melhor opção é um botão de lápis que habilite a edição e depois confirme
// ou desista". Diferente do padrão onBlur dos outros campos, aqui é um modo
// de edição explícito (Salvar/Cancelar) — Telefone e Etapa continuam com o
// comportamento de sempre (auto-save), só ficam "dentro" deste componente
// porque compartilham a mesma área visual do card de detalhe.
export function LeadInfoEditavel({
  leadId,
  hotelAtual,
  nomeAtual,
  emailAtual,
  mensagemAtual,
  telefoneAtual,
  criadoEmLabel,
  etapaAtualId,
  etapas,
  moverEtapaAction,
  atualizarTelefoneAction,
  atualizarDadosAction,
}: {
  leadId: string;
  hotelAtual: string;
  nomeAtual: string;
  emailAtual: string;
  mensagemAtual: string;
  telefoneAtual: string;
  criadoEmLabel: string;
  etapaAtualId: string | null;
  etapas: Array<{ id: string; nome: string }>;
  moverEtapaAction: (leadId: string, novaEtapaId: string) => Promise<void>;
  atualizarTelefoneAction: (leadId: string, telefone: string) => Promise<void>;
  atualizarDadosAction: (
    leadId: string,
    dados: { hotel: string; nome: string; email: string; mensagem: string }
  ) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [hotel, setHotel] = useState(hotelAtual);
  const [nome, setNome] = useState(nomeAtual);
  const [email, setEmail] = useState(emailAtual);
  const [mensagem, setMensagem] = useState(mensagemAtual);

  function iniciarEdicao() {
    // Reseta pros valores atuais toda vez que abre (evita reaparecer uma
    // edição não salva de uma sessão anterior, ex.: abriu, digitou, cancelou
    // via navegação sem clicar em "Cancelar", voltou depois).
    setHotel(hotelAtual);
    setNome(nomeAtual);
    setEmail(emailAtual);
    setMensagem(mensagemAtual);
    setEditando(true);
  }

  function cancelar() {
    setEditando(false);
  }

  async function salvar() {
    if (!hotel.trim() || !nome.trim()) return;
    setSalvando(true);
    try {
      await atualizarDadosAction(leadId, {
        hotel: hotel.trim(),
        nome: nome.trim(),
        email: email.trim(),
        mensagem: mensagem.trim(),
      });
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid #d2d2d7",
    background: "#fff",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const botaoStyle: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #d2d2d7",
    background: "#fff",
    color: "#1d1d1f",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ flex: "1 1 260px", minWidth: 220 }}>
          {!editando ? (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{hotelAtual}</h1>
              <p style={{ margin: "4px 0 0", color: "#6e6e73", fontSize: 13 }}>{nomeAtual}</p>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 340 }}>
              <input
                value={hotel}
                onChange={(e) => setHotel(e.target.value)}
                placeholder="Hotel"
                style={{ ...inputStyle, fontSize: 15, fontWeight: 700 }}
              />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do contato"
                style={inputStyle}
              />
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!editando ? (
            <button
              type="button"
              onClick={iniciarEdicao}
              title="Editar dados do lead"
              aria-label="Editar dados do lead"
              style={{ ...botaoStyle, padding: "6px 9px", display: "flex" }}
            >
              <IconeLapis />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando || !hotel.trim() || !nome.trim()}
                style={{
                  ...botaoStyle,
                  background: "#1a7f37",
                  borderColor: "#1a7f37",
                  color: "#fff",
                  opacity: salvando || !hotel.trim() || !nome.trim() ? 0.6 : 1,
                }}
              >
                {salvando ? "Salvando..." : "✓ Salvar"}
              </button>
              <button type="button" onClick={cancelar} disabled={salvando} style={botaoStyle}>
                Cancelar
              </button>
            </>
          )}
          <EtapaSelect leadId={leadId} etapaAtualId={etapaAtualId} etapas={etapas} action={moverEtapaAction} />
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 13.5, color: "#1d1d1f" }}>
          <span style={{ color: "#6e6e73" }}>E-mail: </span>
          {!editando ? (
            emailAtual ? (
              <a href={`mailto:${emailAtual}`} style={{ color: "#0071e3" }}>
                {emailAtual}
              </a>
            ) : (
              "—"
            )
          ) : (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              style={{ ...inputStyle, display: "inline-block", width: 240 }}
            />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#1d1d1f" }}>
          <span style={{ color: "#6e6e73" }}>Telefone:</span>
          <TelefoneInput leadId={leadId} telefoneAtual={telefoneAtual} action={atualizarTelefoneAction} />
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: "#1d1d1f" }}>
          <span style={{ color: "#6e6e73" }}>Criado em: </span>
          {criadoEmLabel}
        </p>
      </div>

      {(editando || mensagemAtual) && (
        <div style={{ margin: "10px 0 0", fontSize: 13.5, color: "#1d1d1f", lineHeight: 1.5 }}>
          <span style={{ color: "#6e6e73" }}>Mensagem: </span>
          {!editando ? (
            <>“{mensagemAtual}”</>
          ) : (
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Mensagem do lead (opcional)"
              rows={3}
              style={{ ...inputStyle, marginTop: 4, resize: "vertical" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
