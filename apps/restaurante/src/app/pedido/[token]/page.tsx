import { prisma } from "@praxis/core";
import { PedidoFlow } from "./PedidoFlow";

// ÚNICA rota pública (sem sessão) da v2: o token do link é a credencial.
// Server component busca os dados direto do banco; o fluxo interativo fica
// no client component PedidoFlow, que só fala com /api/publico/confirmar.
export const dynamic = "force-dynamic";

export default async function PedidoPublicoPage({ params }: { params: { token: string } }) {
  const pedido = await prisma.breakfastOrder.findUnique({
    where: { token: params.token },
    include: { itens: true },
  });

  if (!pedido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 p-6">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">🥐</p>
          <h1 className="text-xl font-bold text-gray-800">Link não encontrado</h1>
          <p className="text-sm text-gray-500 mt-2">
            Este link de pedido não existe ou foi cancelado. Fale com a recepção para receber um novo.
          </p>
        </div>
      </div>
    );
  }

  const editavel = ["LINK_ENVIADO", "RECEBIDO"].includes(pedido.status);

  const secoes = await prisma.menuSection.findMany({
    where: { tenantId: pedido.tenantId, ativo: true },
    orderBy: { ordem: "asc" },
    include: {
      items: {
        where: { ativo: true },
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, descricao: true },
      },
    },
  });

  return (
    <PedidoFlow
      token={pedido.token}
      clienteNome={pedido.clienteNome}
      uhNumero={pedido.uhNumero}
      tipo={pedido.tipo as "SINGLE" | "DOUBLE"}
      editavel={editavel}
      jaConfirmado={pedido.status !== "LINK_ENVIADO"}
      observacoesIniciais={pedido.observacoes ?? ""}
      horarioInicial={pedido.horarioEntrega}
      itensIniciais={Object.fromEntries(pedido.itens.map((i) => [i.menuItemId, i.quantidade]))}
      secoes={secoes.map((s) => ({
        id: s.id,
        nome: s.nome,
        limiteSingle: s.limiteSingle,
        items: s.items,
      }))}
    />
  );
}
