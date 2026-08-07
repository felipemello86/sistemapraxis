import { getSession } from "@praxis/core";
import { TransacoesCadastroView } from "../TransacoesCadastroView";

export default async function TransacoesCadastroPage() {
  const session = await getSession();
  return <TransacoesCadastroView role={session?.role ?? ""} />;
}
