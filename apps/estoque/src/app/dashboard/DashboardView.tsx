"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Package, AlertTriangle, ArrowLeftRight, Send, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type Produto = { id: string; nome: string; categoria: string; unidade: string; quantidade: number; estoqueMinimo: number };
type Movimento = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  quantidade: number;
  observacao: string | null;
  createdAt: string;
  product: { nome: string; unidade: string };
};
type DashboardData = {
  totalProdutos: number;
  emAlerta: number;
  movimentosHoje: number;
  telegramConfigurado: boolean;
  produtosEmAlerta: Produto[];
  ultimosMovimentos: Movimento[];
};

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 text-sm">Carregando...</p>;
  if (!data) return <p className="text-gray-500 text-sm">Não foi possível carregar o dashboard.</p>;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Visão geral do estoque</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 leading-none">{data.totalProdutos}</p>
            <p className="text-xs text-gray-500 mt-1">Total de Produtos</p>
          </div>
        </div>

        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 leading-none">{data.emAlerta}</p>
            <p className="text-xs text-gray-500 mt-1">Em Alerta de Estoque</p>
          </div>
        </div>

        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 leading-none">{data.movimentosHoje}</p>
            <p className="text-xs text-gray-500 mt-1">Movimentos Hoje</p>
          </div>
        </div>

        <div className="card flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${data.telegramConfigurado ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
            <Send className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-sm font-bold leading-none ${data.telegramConfigurado ? "text-emerald-600" : "text-gray-500"}`}>
              {data.telegramConfigurado ? "Configurado" : "Não configurado"}
            </p>
            <p className="text-xs text-gray-500 mt-1">Status Telegram</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Produtos em Alerta
            </h2>
            <Link href="/produtos" className="text-xs font-medium text-blue-700 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-50">
              Ver todos
            </Link>
          </div>
          {data.produtosEmAlerta.length === 0 ? (
            <p className="text-sm text-gray-500 px-4 py-6 text-center">Nenhum produto abaixo do mínimo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Produto</th>
                  <th className="text-right px-4 py-2">Atual</th>
                  <th className="text-right px-4 py-2">Mínimo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.produtosEmAlerta.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{p.nome}</p>
                      <p className="text-xs text-gray-400">{p.categoria}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-600 font-medium">{p.quantidade} {p.unidade}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{p.estoqueMinimo} {p.unidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <ArrowLeftRight className="w-4 h-4 text-gray-500" /> Últimos Movimentos
            </h2>
            <Link href="/movimentos" className="text-xs font-medium text-blue-700 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-50">
              Ver todos
            </Link>
          </div>
          {data.ultimosMovimentos.length === 0 ? (
            <p className="text-sm text-gray-500 px-4 py-6 text-center">Nenhuma movimentação ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-4 py-2">Produto</th>
                  <th className="text-right px-4 py-2">Qtd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.ultimosMovimentos.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{format(new Date(m.createdAt), "dd/MM HH:mm")}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{m.product.nome}</p>
                      <p className="text-xs text-gray-400">{m.observacao || "—"}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center gap-1 font-medium ${m.tipo === "ENTRADA" ? "text-green-700" : "text-red-700"}`}>
                        {m.tipo === "ENTRADA" ? <ArrowDownCircle className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                        {m.quantidade} {m.product.unidade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
