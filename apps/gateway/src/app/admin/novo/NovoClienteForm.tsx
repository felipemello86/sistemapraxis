"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CriarClienteResult } from "../actions";

const initialState: CriarClienteResult | null = null;

const MODULOS: { value: string; label: string }[] = [
  { value: "HOUSEKEEPING", label: "Governança" },
  { value: "MAINTENANCE", label: "Manutenção" },
  { value: "BOOKING_REVIEWS", label: "Avaliações" },
  { value: "STOCK", label: "Estoque" },
  { value: "RESTAURANT", label: "Restaurante" },
  { value: "INTELLIGENCE", label: "Central de Inteligência" },
];

const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 12,
  border: "1px solid #d2d2d7",
  fontSize: 15,
  width: "100%",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#6e6e73", fontWeight: 500 };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        padding: "12px 16px",
        borderRadius: 12,
        border: "none",
        background: pending ? "#a1a1a6" : "#1d1d1f",
        color: "#fff",
        fontSize: 15,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Criando..." : "Criar cliente"}
    </button>
  );
}

export function NovoClienteForm({
  action,
}: {
  action: (prevState: CriarClienteResult | null, formData: FormData) => Promise<CriarClienteResult>;
}) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="nome" style={labelStyle}>
          Nome do hotel/cliente
        </label>
        <input id="nome" name="nome" required style={inputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="slug" style={labelStyle}>
          Slug (URL — só letras minúsculas, números e hífen)
        </label>
        <input id="slug" name="slug" required pattern="[a-z0-9-]+" style={inputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={labelStyle}>Módulos a habilitar</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
          {MODULOS.map((m) => (
            <label key={m.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input type="checkbox" name="modules" value={m.value} />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #e5e5e7", margin: "4px 0" }} />

      <p style={{ margin: 0, fontSize: 13, color: "#6e6e73", fontWeight: 600 }}>Usuário MASTER inicial</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="nomeUsuario" style={labelStyle}>
          Nome (opcional — usa o nome do cliente se vazio)
        </label>
        <input id="nomeUsuario" name="nomeUsuario" style={inputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="email" style={labelStyle}>
          E-mail
        </label>
        <input id="email" name="email" type="email" required style={inputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="senha" style={labelStyle}>
          Senha temporária
        </label>
        <input id="senha" name="senha" type="text" required minLength={6} style={inputStyle} />
      </div>

      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}

      <div style={{ marginTop: 4 }}>
        <SubmitButton />
      </div>
    </form>
  );
}
