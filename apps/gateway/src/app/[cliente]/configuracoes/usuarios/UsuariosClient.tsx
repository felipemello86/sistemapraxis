"use client";

import { useEffect, useState, type CSSProperties, type ChangeEvent } from "react";

type User = {
  id: string;
  nome: string;
  email: string | null;
  role: string;
  telegramChatId: string | null;
  whatsapp: string | null;
  foto: string | null;
  cozinha: boolean;
  ativo: boolean;
  modules?: string[];
};

const ROLES = ["MASTER", "GERENTE", "GOVERNANTA", "CAMAREIRA", "LAVANDERIA", "MANUTENCAO", "ATENDIMENTO"];

const ROLE_LABEL: Record<string, string> = {
  MASTER: "Master",
  GERENTE: "Gerente",
  GOVERNANTA: "Governanta",
  CAMAREIRA: "Camareira",
  LAVANDERIA: "Lavanderia",
  MANUTENCAO: "Manutenção",
  ATENDIMENTO: "Atendimento",
};

const MODULOS = [
  { value: "HOUSEKEEPING", label: "Governança" },
  { value: "MAINTENANCE", label: "Manutenção" },
  { value: "BOOKING_REVIEWS", label: "Avaliações" },
  { value: "STOCK", label: "Estoque" },
  { value: "RESTAURANT", label: "Restaurante" },
] as const;

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

function Avatar({ nome, foto, size = 36 }: { nome: string; foto?: string | null; size?: number }) {
  if (foto) {
    return (
      <img
        src={foto}
        alt={nome}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#e8f0fe",
        color: "#0071e3",
        fontWeight: 700,
        fontSize: size * 0.4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {nome[0]?.toUpperCase()}
    </div>
  );
}

// Redimensiona no client antes de subir — mesmo padrão usado em
// apps/housekeeping/src/components/camareira/CamareiraView.tsx.
async function comprimirImagem(file: File, maxWidth = 480, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

function FotoUploader({ nome, foto, onChange }: { nome: string; foto: string | null; onChange: (url: string | null) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputId = `foto-upload-${Math.random().toString(36).slice(2)}`;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviando(true);
    setErro(null);
    try {
      const comprimido = await comprimirImagem(file);
      const fd = new FormData();
      fd.append("file", comprimido);
      fd.append("pasta", "perfis");
      fd.append("tipo", "perfil");
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error || "Erro ao enviar foto");
      onChange(data.url);
    } catch (e: any) {
      setErro(e.message || "Erro ao enviar foto");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar nome={nome || "?"} foto={foto} size={52} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <label
            htmlFor={inputId}
            style={{ fontSize: 13, fontWeight: 600, color: "#0071e3", cursor: enviando ? "default" : "pointer" }}
          >
            {enviando ? "Enviando..." : foto ? "Trocar foto" : "Adicionar foto"}
          </label>
          <input id={inputId} type="file" accept="image/*" onChange={handleFile} disabled={enviando} style={{ display: "none" }} />
          {foto && (
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ background: "none", border: "none", color: "#d70015", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              Remover
            </button>
          )}
        </div>
        {erro && <span style={{ fontSize: 12, color: "#d70015" }}>{erro}</span>}
      </div>
    </div>
  );
}

function ModuleCheckboxes({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
      {MODULOS.map((m) => (
        <label key={m.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#1d1d1f" }}>
          <input
            type="checkbox"
            checked={value.includes(m.value)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, m.value] : value.filter((mod) => mod !== m.value))
            }
          />
          {m.label}
        </label>
      ))}
    </div>
  );
}

const emptyNewForm = { nome: "", email: "", role: "CAMAREIRA", telegramChatId: "", whatsapp: "", password: "", modules: [] as string[], foto: null as string | null, cozinha: false };

export function UsuariosClient({ somenteLeitura }: { somenteLeitura: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", email: "", role: "", telegramChatId: "", whatsapp: "", password: "", modules: [] as string[], foto: null as string | null, cozinha: false });
  const [newForm, setNewForm] = useState(emptyNewForm);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    const data = await fetch("/api/usuarios").then((r) => r.json());
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function adicionar() {
    if (!newForm.nome || !newForm.email || !newForm.password) return;
    setErro(null);
    setSalvando(true);
    const r = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    const data = await r.json();
    if (!r.ok) {
      setErro(data.error || `Erro ${r.status}`);
    } else {
      setNewForm(emptyNewForm);
      carregar();
    }
    setSalvando(false);
  }

  async function excluirUsuario(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
    await fetch("/api/usuarios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    carregar();
  }

  async function salvarEdicao() {
    setSalvando(true);
    await fetch("/api/usuarios", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, ...editForm }),
    });
    setEditId(null);
    setSalvando(false);
    carregar();
  }

  if (loading) return <p style={{ color: "#6e6e73" }}>Carregando...</p>;

  return (
    <div>
      {somenteLeitura && (
        <div style={{ ...cardStyle, background: "#f5f5f7", color: "#6e6e73", fontSize: 14 }}>
          Modo somente leitura — seu perfil não pode gerenciar usuários.
        </div>
      )}

      {!somenteLeitura && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Novo usuário</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
            <FotoUploader nome={newForm.nome} foto={newForm.foto} onChange={(url) => setNewForm({ ...newForm, foto: url })} />
            <label style={labelStyle}>
              Nome
              <input style={inputStyle} value={newForm.nome} onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })} />
            </label>
            <label style={labelStyle}>
              Cargo
              <select style={inputStyle} value={newForm.role} onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Email (para login)
              <input style={inputStyle} type="email" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} />
            </label>
            <label style={labelStyle}>
              Senha inicial
              <input
                style={inputStyle}
                type="password"
                placeholder="Mín. 6 caracteres"
                value={newForm.password}
                onChange={(e) => setNewForm({ ...newForm, password: e.target.value })}
              />
            </label>
            <label style={labelStyle}>
              WhatsApp / telefone (opcional)
              <input
                style={inputStyle}
                placeholder="ex: 5581999999999"
                value={newForm.whatsapp}
                onChange={(e) => setNewForm({ ...newForm, whatsapp: e.target.value.trim() })}
              />
            </label>
            <label style={labelStyle}>
              Telegram Chat ID (opcional)
              <input
                style={{ ...inputStyle, fontFamily: "monospace" }}
                placeholder="ex: 123456789"
                value={newForm.telegramChatId}
                onChange={(e) => setNewForm({ ...newForm, telegramChatId: e.target.value.trim() })}
              />
            </label>
            <div>
              <p style={{ ...labelStyle, marginBottom: 6 }}>Módulos que essa pessoa pode acessar</p>
              <ModuleCheckboxes value={newForm.modules} onChange={(v) => setNewForm({ ...newForm, modules: v })} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#1d1d1f" }}>
              <input
                type="checkbox"
                checked={newForm.cozinha}
                onChange={(e) => setNewForm({ ...newForm, cozinha: e.target.checked, modules: e.target.checked && !newForm.modules.includes("RESTAURANT") ? [...newForm.modules, "RESTAURANT"] : newForm.modules })}
              />
              Cozinha — pode operar o kanban de pedidos do Restaurante
            </label>
          </div>
          <button onClick={adicionar} disabled={salvando || !newForm.nome || !newForm.email || !newForm.password} style={btnStyle(true, salvando)}>
            Adicionar
          </button>
          {erro && <p style={{ color: "#d70015", fontSize: 14, marginTop: 10 }}>{erro}</p>}
        </div>
      )}

      <div>
        {users.map((u) => (
          <div key={u.id} style={cardStyle}>
            {editId === u.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FotoUploader nome={editForm.nome} foto={editForm.foto} onChange={(url) => setEditForm({ ...editForm, foto: url })} />
                <label style={labelStyle}>
                  Nome
                  <input style={inputStyle} value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
                </label>
                <label style={labelStyle}>
                  Cargo
                  <select style={inputStyle} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Email
                  <input style={inputStyle} type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </label>
                <label style={labelStyle}>
                  Nova senha (deixe em branco para manter)
                  <input style={inputStyle} type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                </label>
                <label style={labelStyle}>
                  WhatsApp / telefone
                  <input
                    style={inputStyle}
                    value={editForm.whatsapp}
                    onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value.trim() })}
                  />
                </label>
                <label style={labelStyle}>
                  Telegram Chat ID
                  <input
                    style={{ ...inputStyle, fontFamily: "monospace" }}
                    value={editForm.telegramChatId}
                    onChange={(e) => setEditForm({ ...editForm, telegramChatId: e.target.value.trim() })}
                  />
                </label>
                <div>
                  <p style={{ ...labelStyle, marginBottom: 6 }}>Módulos que essa pessoa pode acessar</p>
                  <ModuleCheckboxes value={editForm.modules} onChange={(v) => setEditForm({ ...editForm, modules: v })} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#1d1d1f" }}>
                  <input
                    type="checkbox"
                    checked={editForm.cozinha}
                    onChange={(e) => setEditForm({ ...editForm, cozinha: e.target.checked, modules: e.target.checked && !editForm.modules.includes("RESTAURANT") ? [...editForm.modules, "RESTAURANT"] : editForm.modules })}
                  />
                  Cozinha — pode operar o kanban de pedidos do Restaurante
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={salvarEdicao} disabled={salvando} style={btnStyle(true, salvando)}>
                    Salvar
                  </button>
                  <button onClick={() => setEditId(null)} style={btnStyle(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <Avatar nome={u.nome} foto={u.foto} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{u.nome}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#e8e8ed",
                          color: "#1d1d1f",
                        }}
                      >
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#86868b", marginTop: 2 }}>
                      {u.email}
                      {u.modules && u.modules.length > 0 && (
                        <span> · {u.modules.map((m) => MODULOS.find((mo) => mo.value === m)?.label ?? m).join(", ")}</span>
                      )}
                    </div>
                  </div>
                </div>
                {!somenteLeitura && (
                  <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        setEditId(u.id);
                        setEditForm({
                          nome: u.nome,
                          email: u.email || "",
                          role: u.role,
                          telegramChatId: u.telegramChatId || "",
                          whatsapp: u.whatsapp || "",
                          password: "",
                          modules: u.modules || [],
                          foto: u.foto,
                          cozinha: u.cozinha ?? false,
                        });
                      }}
                      style={{ background: "none", border: "none", color: "#0071e3", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluirUsuario(u.id, u.nome)}
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
