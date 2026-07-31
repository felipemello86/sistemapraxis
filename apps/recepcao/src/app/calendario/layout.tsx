import { ModuleShell } from "@/components/layout/ModuleShell";

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return <ModuleShell>{children}</ModuleShell>;
}
