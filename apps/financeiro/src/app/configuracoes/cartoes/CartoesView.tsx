"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CreditCard } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Configuração dos cartões de crédito conectados — pedido do Felipe,
// 05/08/2026, 2 rodadas: pra compras no cartão sempre usarem a data de
// vencimento da FATURA (não a data da compra), o sistema precisa saber o
// dia de FECHAMENTO e o dia de VENCIMENTO de cada fatura. Os dois juntos
// definem o ciclo (ver calcularVencimentoFatura em lib/finance/pluggy.ts) —
// ex.: fechamento=1, vencimento=10 → compras de 2/jul a 1/ago formam a
// fatura que vence em 10/ago.

type Cartao = { id: string; nome: string; instituicao: string; diaVencimentoFatura: number | null; diaFechamentoFatura: number | null };

function DiaInput({ valorInicial, onSalvar }: { valorInicial: number | null; onSalvar: (v: number) => void }) {
  const [valor, setValor] = useState(valorInicial != null ? String(valorInicial) : "");
  const [salvo, setSalvo] = useState(false);
  useEffect(() => setValor(valorInicial != null ? String(valorInicial) : ""), [valorInicial]);

  return (
    <div className="relative w-20 flex-shrink-0">
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

  async function salvarCampo(id: string, campo: "diaVencimentoFatura" | "diaFechamentoFatura", dia: number) {
    await apiFetch("/api/contas/cartoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, [campo]: dia }) });
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
          Informe o dia de fechamento e o dia de vencimento da fatura de cada cartão. A partir disso, toda compra passa a ter como Data de
          Vencimento a data da fatura em que ela cai, não a data da compra — e o filtro "Mensal" em Lançamentos mostra exatamente as compras
          daquele ciclo.
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
              <span className="text-xs text-gray-400 flex-shrink-0">fecha dia</span>
              <DiaInput valorInicial={c.diaFechamentoFatura} onSalvar={(dia) => salvarCampo(c.id, "diaFechamentoFatura", dia)} />
              <span className="text-xs text-gray-400 flex-shrink-0">vence dia</span>
              <DiaInput valorInicial={c.diaVencimentoFatura} onSalvar={(dia) => salvarCampo(c.id, "diaVencimentoFatura", dia)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
