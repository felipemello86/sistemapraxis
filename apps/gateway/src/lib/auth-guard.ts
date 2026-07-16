import { NextResponse } from "next/server";
import type { SessionPayload } from "@praxis/core";

// MASTER/GERENTE gerenciam qualquer cadastro central do tenant — hoje
// Usuários e UHs, ambos válidos em todos os módulos (Governança, Manutenção,
// Avaliações). Um guard genérico só, em vez de um por cadastro.
const ROLES_PODEM_GERENCIAR_CADASTROS = ["MASTER", "GERENTE"];

export function podeGerenciarCadastros(role: string | undefined | null): boolean {
  return !!role && ROLES_PODEM_GERENCIAR_CADASTROS.includes(role);
}

/** @deprecated use podeGerenciarCadastros — mantido pelo nome já usado em Usuários. */
export const podeGerenciarUsuarios = podeGerenciarCadastros;

/** Retorna 403 se a sessão não puder gerenciar cadastros centrais (ou não existir). */
export function bloqueadoParaGerenciarCadastros(session: SessionPayload | null) {
  if (!session || !podeGerenciarCadastros(session.role)) {
    return NextResponse.json({ error: "Seu perfil não pode gerenciar este cadastro." }, { status: 403 });
  }
  return null;
}

/** @deprecated use bloqueadoParaGerenciarCadastros — mantido pelo nome já usado em Usuários. */
export const bloqueadoParaGerenciarUsuarios = bloqueadoParaGerenciarCadastros;
