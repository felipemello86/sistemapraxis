import { NextResponse } from "next/server";
import type { SessionPayload } from "@praxis/core";

const ROLES_PODEM_GERENCIAR_USUARIOS = ["MASTER", "GERENTE"];

export function podeGerenciarUsuarios(role: string | undefined | null): boolean {
  return !!role && ROLES_PODEM_GERENCIAR_USUARIOS.includes(role);
}

/** Retorna 403 se a sessão não puder gerenciar usuários (ou não existir). */
export function bloqueadoParaGerenciarUsuarios(session: SessionPayload | null) {
  if (!session || !podeGerenciarUsuarios(session.role)) {
    return NextResponse.json({ error: "Seu perfil não pode gerenciar usuários." }, { status: 403 });
  }
  return null;
}
