import { redirect } from "next/navigation";
import { getSession, prisma } from "@praxis/core";
import LogView from "./LogView";

// Portado de apps/housekeeping/src/app/logs/page.tsx (v1). Cadastro único:
// todo mundo com acesso ao módulo enxerga esta tela (sem gate extra por
// cargo, igual v1).
export default async function LogsPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  // Tela só de leitura — visualização liberada mesmo sem acesso ao módulo
  // (ver comentário em apps/maintenance/src/app/page.tsx).

  const camareiras = await prisma.user.findMany({
    where: { tenantId: session.tenantId, role: "CAMAREIRA", ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  return <LogView camareiras={camareiras} />;
}
