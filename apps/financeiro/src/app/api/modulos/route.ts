import { NextResponse } from "next/server";
import { getSession, getAccessibleModules, MODULE_SLUGS, MODULE_LABELS } from "@praxis/core";

// Lista os módulos que a pessoa logada pode acessar (tenant habilitado E
// acesso individual, ver getAccessibleModules em @praxis/core) — alimenta o
// dropdown "trocar de módulo" da Sidebar. Idêntico ao de apps/estoque.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const modulos = await getAccessibleModules(session);
  const lista = modulos.map((m) => ({ module: m, slug: MODULE_SLUGS[m], label: MODULE_LABELS[m] }));

  return NextResponse.json(lista);
}
