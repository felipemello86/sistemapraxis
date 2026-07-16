"use client";

import { useEffect, useState, type CSSProperties } from "react";

type UH = { id: string; numero: string; tipo: string; ordem: number; ativo: boolean };

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d2d2d7",
  fontSize: 15,
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#6e6e73",
};

function btnStyle(primary: boolean, disabled = false): CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 10,
    border: primary ? "none" : "1px solid #d2d2d7",
    background: disabled ? "#a1a1a6" : primary ? "#1d1d1f" : "#fff",
    color: primary ? "#fff" : "#1d1d1f",
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
  };
}

export function UHsClient({ somenteLeitura }: { somenteLeitura: boolean }) {
  const [uhs, setUHs] = useState<UH[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNumero, setEditNumero] = useState("");
  const [newNumero, setNewNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ascending, setAscending] = useState(true);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      const r = await fetch("/api/uhs");
      const data = await r.json();
      setUHs(Array.isArray(data) ? data : []);
    } catch {
      setErro("Erro ao carregar UHs");
    }
    setLoading(false);
  }

  async function adicionar() {
    if (!newNumero) return;
    setErro(null);
    setSalvando(true);
    try {
      const r = await fetch("/api/uhs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: newNumero, tipo: "Standard", ordem: 0 }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErro(data.error || `Erro ${r.status}`);
      } else {
        setNewNumero("");
        carregar();
      }
    } catch (e: any) {
      setErro(e.message || "Erro ao adicionar");
    }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editId) return;
    setSalvando(true);
    await fetch("/api/uhs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, numero: editNumero, tipo: "Standard", ordem: 0 }),
    });
    setEditId(null);
    setSalvando(false);
    carregar();
  }

  async function excluir(id: string, numero: string) {
    if (!confirm(`Excluir a UH "${numero}"?`)) return;
    await fetch("/api/uhs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    carregar();
  }

  const sorted = [...uhs].sort((a, b) =>
    ascending
      ? a.numero.localeCompare(b.numero, undefined, { numeric: true })
      : b.numero.localeCompare(a.numero, undefined, { numeric: true })
  );

  if (loading) return <p style={{ color: "#6e6e73" }}>Carregando...</p>;

  return (
    <div>
      {somenteLeitura && (
        <div style={{ ...cardStyle, background: "#f5f5f7", color: "#6e6e73", fontSize: 14 }}>
          Modo somente leitura — seu perfil não pode gerenciar UHs.
        </div>
      )}

      {!somenteLeitura && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Nova UH</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              Número/Nome
              <input
                style={inputStyle}
                placeholder="ex: 101, CHALÉ A"
                value={newNumero}
                onChange={(e) => setNewNumero(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionar()}
              />
            </label>
            <button onClick={adicionar} disabled={salvando || !newNumero} style={btnStyle(true, salvando || !newNumero)}>
              Adicionar
            </button>
          </div>
          {erro && <p style={{ color: "#d70015", fontSize: 14, marginTop: 10 }}>{erro}</p>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
        <span style={{ fontSize: 13, color: "#6e6e73" }}>{uhs.length} UH(s)</span>
        <button
          onClick={() => setAscending(!ascending)}
          style={{ background: "none", border: "none", color: "#0071e3", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {ascending ? "A → Z" : "Z → A"}
        </button>
      </div>

      <div>
        {sorted.map((uh) => (
          <div key={uh.id} style={cardStyle}>
            {!somenteLeitura && editId === uh.id ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input style={{ ...inputStyle, flex: 1 }} value={editNumero} onChange={(e) => setEditNumero(e.target.value)} />
                <button onClick={salvarEdicao} style={{ background: "none", border: "none", color: "#1d8a3e", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Salvar
                </button>
                <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: "#6e6e73", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{uh.numero}</span>
                {!somenteLeitura && (
                  <div style={{ display: "flex", gap: 14 }}>
                    <button
                      onClick={() => { setEditId(uh.id); setEditNumero(uh.numero); }}
                      style={{ background: "none", border: "none", color: "#0071e3", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluir(uh.id, uh.numero)}
                      style={{ background: "none", border: "none", color: "#d70015", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
