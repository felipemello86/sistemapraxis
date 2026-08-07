"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Abas Fluxo/Cadastro (pedido do Felipe, 07/08/2026: "Divida a tela
// Transações em Cadastro de Transações e Fluxo de Transações") — mesmo
// visual de pill toggle já usado em outros lugares do app (ex.: Geral/
// Empreendimento/Unidade em DreView.tsx).

const ABAS = [
  { href: "/transacoes", label: "Fluxo de Transações" },
  { href: "/transacoes/cadastro", label: "Cadastro de Transações" },
];

export function AbasTransacoes() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {ABAS.map((aba) => {
        const ativa = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${ativa ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            {aba.label}
          </Link>
        );
      })}
    </div>
  );
}
