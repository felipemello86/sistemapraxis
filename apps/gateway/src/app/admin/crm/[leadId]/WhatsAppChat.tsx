"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminActionResult } from "../../actions";

type Mensagem = {
  id: string;
  direcao: "ENVIADA" | "RECEBIDA";
  conteudo: string;
  tipo: string;
  status: "ENVIADA" | "ENTREGUE" | "LIDA" | "FALHOU";
  createdAt: string; // serializado como ISO string vindo da API de polling
};

const STATUS_ICONE: Record<Mensagem["status"], string> = {
  ENVIADA: "✓",
  ENTREGUE: "✓✓",
  LIDA: "✓✓", // cor diferenciada no render, ver corStatus abaixo
  FALHOU: "⚠️",
};

// Painel de chat de WhatsApp na tela de detalhe do lead (CRM Fase 2,
// 30/07/2026). Sem WebSocket/Pusher na suíte: novas mensagens recebidas
// chegam via webhook (POST /api/whatsapp/webhook, assíncrono, fora do
// ciclo de vida desta página) — por isso o polling simples a cada 4s em vez
// de esperar só a carga inicial. Volume baixíssimo de conversas simultâneas
// (uso interno, poucos vendedores) então polling é suficiente, não justifica
// a complexidade de um servidor de WebSocket separado.
export function WhatsAppChat({
  leadId,
  mensagensIniciais,
  action,
}: {
  leadId: string;
  mensagensIniciais: Mensagem[];
  action: (leadId: string, texto: string) => Promise<AdminActionResult>;
}) {
  const [mensagens, setMensagens] = useState(mensagensIniciais);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  async function buscarMensagens() {
    try {
      const resp = await fetch(`/api/admin/whatsapp-mensagens?leadId=${leadId}`, { cache: "no-store" });
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data.mensagens)) setMensagens(data.mensagens);
    } catch {
      // Falha de rede pontual no polling — silencioso, tenta de novo no próximo tick.
    }
  }

  useEffect(() => {
    const intervalo = setInterval(buscarMensagens, 4000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  async function enviar() {
    const textoLimpo = texto.trim();
    if (!textoLimpo || enviando) return;
    setEnviando(true);
    setErro(null);
    const resultado = await action(leadId, textoLimpo);
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.error);
      return;
    }
    setTexto("");
    void buscarMensagens();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 420 }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "4px 4px 8px",
          background: "#f5f5f7",
          borderRadius: 10,
        }}
      >
        {mensagens.length === 0 && (
          <p style={{ fontSize: 12, color: "#a1a1a6", padding: 8 }}>Nenhuma mensagem ainda.</p>
        )}
        {mensagens.map((m) => {
          const minha = m.direcao === "ENVIADA";
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: minha ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "75%",
                  background: minha ? "#dcf8c6" : "#fff",
                  borderRadius: 10,
                  padding: "7px 10px",
                  boxShadow: "0 1px 1px rgba(0,0,0,0.05)",
                }}
              >
                <p style={{ margin: 0, fontSize: 13.5, color: "#1d1d1f", whiteSpace: "pre-wrap" }}>{m.conteudo}</p>
                <p style={{ margin: "3px 0 0", fontSize: 10.5, color: "#6e6e73", textAlign: "right" }}>
                  {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {minha && (
                    <span style={{ marginLeft: 4, color: m.status === "LIDA" ? "#0071e3" : "#6e6e73" }}>
                      {STATUS_ICONE[m.status]}
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {erro && <p style={{ color: "#d70015", fontSize: 12, margin: "6px 0 0" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escreva uma mensagem..."
          disabled={enviando}
          style={{
            flex: 1,
            padding: "9px 12px",
            borderRadius: 9,
            border: "1px solid #d2d2d7",
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            border: "none",
            background: enviando || !texto.trim() ? "#a1a1a6" : "#1d1d1f",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: enviando || !texto.trim() ? "default" : "pointer",
          }}
        >
          Enviar
        </button>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#a1a1a6" }}>
        A Meta só permite texto livre até 24h depois da última mensagem do contato. Fora desse prazo, o envio falha
        (precisa de um template aprovado — ainda não suportado aqui).
      </p>
    </div>
  );
}
