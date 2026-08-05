"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CreditCard } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Configuração dos cartões de crédito conectados — pedido do Felipe,
// 05/08/2026: pra compras no cartão sempre usarem a data de vencimento da
// FATURA (não a data da compra), o sistema precisa saber o dia do mês em
// que cada fatura vence. Sem dia de fechamento separado de propósito — só
// o vencimento, regra simplificada explicada em lib/finance/pluggy.ts
// (calcularVencimentoFatura).

type Cartao = { id: string; nome: string; instituicao: string; diaVencimentoFatura: number | null };

function DiaInput({ valorInicial, onSalvar }: { valorInicial: number | null; onSalvar: (v: number) => void }) {
  const [valor, setValor] = useState(valorInicial != null ? String(valorInicial) : "");
  const [salvo, setSalvo] = useState(false);
  useEffect(() => setValor(valorInicial != null ? String(valorInicial) : ""), [valorInicial]);

  return (
    <div className="relative w-24 flex-shrink-0">
      <input
        type="number"
        min="1"
        max="31"
        placeholder="dia"
        className="input text-sm py-1.5 pr-7"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => {
          const n = Number(valor);
          if (valor !== "" && n >= 1 && n <= 31 && n !== valorInicial) {
            onSalvar(n);
            setSalvo(true);
            setTimeout(() => setSalvo(false), 1500);
          }
        }}
      />
      {salvo && <Check className="w-3.5 h-3.5 text-green-600 absolute right-2 top-1/2 -translate-y-1/2" />}
    </div>
  );
}

export function CartoesView() {
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    const res = await apiFetch("/api/contas/cartoes");
    if (res.ok) setCartoes(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarDia(id: string, dia: number) {
    await apiFetch("/api/contas/cartoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, diaVencimentoFatura: dia }) });
    carregar();
  }

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 w-fit">
        <ArrowLeft className="w-4 h-4" /> Configurações
      </Link>

      <div>
        <h1 className="text-lg font-bold text-gray-900">Cartões de Crédito</h1>
        <p className="text-sm text-gray-500 mt-1">
          Informe o dia do mês em que a fatura de cada cartão vence. A partir disso, toda compra passa a ter como Data de Vencimento a data da fatura
          em que ela cai, não a data da compra.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : cartoes.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum cartão de crédito conectado ainda — conecte um em Contas conectadas primeiro.</p>
      ) : (
        <div className="space-y-2">
          {cartoes.map((c) => (
            <div key={c.id} className="card flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{c.nome}</p>
                <p className="text-xs text-gray-400 truncate">{c.instituicao}</p>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">vence todo dia</span>
              <DiaInput valorInicial={c.diaVencimentoFatura} onSalvar={(dia) => salvarDia(c.id, dia)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
