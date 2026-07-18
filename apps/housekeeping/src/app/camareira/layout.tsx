import { redirect } from "next/navigation";
import { getSession } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function CamareiraLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} />
      <div className="flex-1 hk-content-offset">{children}</div>
    </div>
  );
}
