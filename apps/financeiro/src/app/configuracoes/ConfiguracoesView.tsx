import Link from "next/link";
import { ChevronRight, CreditCard, SlidersHorizontal } from "lucide-react";

// Hub de Configurações do módulo Financeiro — cada área é sua própria
// subtela (pedido do Felipe, 05/08/2026, 2ª rodada: "Cartões de Crédito
// estão como se fossem dentro da DRE. São subtelas distintas"). Antes a
// estrutura da DRE vinha renderizada direto aqui, dando a impressão de que
// Cartões fazia parte dela — agora esta tela é só um menu.

const ITENS = [
  {
    href: "/configuracoes/dre",
    icon: SlidersHorizontal,
    titulo: "Estrutura da DRE",
    descricao: "Blocos, categorias e como somam nos totais (Margem Bruta, Despesas, Lucro/Prejuízo)",
  },
  {
    href: "/configuracoes/cartoes",
    icon: CreditCard,
    titulo: "Cartões de Crédito",
    descricao: "Dia de vencimento da fatura de cada cartão conectado",
  },
];

export function ConfiguracoesView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Ajustes do módulo Financeiro.</p>
      </div>

      <div className="space-y-2">
        {ITENS.map(({ href, icon: Icon, titulo, descricao }) => (
          <Link key={href} href={href} className="card flex items-center gap-3 hover:bg-gray-50 transition-colors">
            <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{titulo}</p>
              <p className="text-xs text-gray-400">{descricao}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
