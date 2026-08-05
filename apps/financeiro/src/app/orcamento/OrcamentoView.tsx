"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Orçamento (linha de base) — requisito 5 do Felipe: configurável linha a
// linha, por categoria individual OU por bloco inteiro. Cada input salva
// (upsert) assim que perde o foco, sem botão "Salvar" geral — mesma
// filosofia de autosave já usada noutras telas de configuração da suíte.

// Duplicado de @praxis/core/finance/dre.ts de propósito (mesmo motivo do
// DreView.tsx): componente client, @praxis/core importa `prisma` no
// módulo — não dá pra importar o pacote inteiro aqui.
const DRE_BLOCOS = [
  "RECEITA_BRUTA", "GASTOS_VARIAVEIS", "DESPESAS_VEICULOS", "DESPESAS_FUNCIONARIOS",
  "DESPESAS_ADMINISTRATIVAS", "DESPESAS_SEDE", "DESPESAS_DIRETORIA", "FINANCEIRAS",
];

const DRE_BLOCO_LABELS: Record<string, string> = {
  RECEITA_BRUTA: "Receita Bruta",
  GASTOS_VARIAVEIS: "Gastos Variáveis",
  DESPESAS_VEICULOS: "Despesas com Veículos e Transporte",
  DESPESAS_FUNCIONARIOS: "Despesas com Funcionários",
  DESPESAS_ADMINISTRATIVAS: "Despesas Administrativas e Comerciais",
  DESPESAS_SEDE: "Despesas com Sede e Estrutura",
  DESPESAS_DIRETORIA: "Despesas com Diretoria",
  FINANCEIRAS: "Despesas e Receitas Financeiras",
};

type Categoria = { id: string; nome: string; tipo: string; bloco: string };
type Orcamento = { id: string; alvoTipo: string; alvoChave: string; valor: string };

function mesAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function ValorInput({ valorInicial, onSalvar }: { valorInicial: string; onSalvar: (v: number) => void }) {
  const [valor, setValor] = useState(valorInicial);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => setValor(valorInicial), [valorInicial]);

  return (
    <div className="relative flex-shrink-0 w-32">
      <input
        type="number"
        step="0.01"
        min="0"
        className="input text-sm py-1.5 pr-7"
        value={valor}
        placeholder="0,00"
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => {
          if (valor !== "" && Number(valor) !== Number(valorInicial || 0)) {
            onSalvar(Number(valor));
            setSalvo(true);
            setTimeout(() => setSalvo(false), 1500);
          }
        }}
      />
      {salvo && <Check className="w-3.5 h-3.5 text-green-600 absolute right-2 top-1/2 -translate-y-1/2" />}
    </div>
  );
}

export function OrcamentoView() {
  const [mes, setMes] = useState(mesAtualSP());
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  async function carregar() {
    setLoading(true);
    const [resC, resO] = await Promise.all([apiFetch("/api/categorias"), apiFetch(`/api/orcamento?mes=${mes}`)]);
    if (resC.ok) setCategorias(await resC.json());
    if (resO.ok) setOrcamentos(await resO.json());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  function valorDe(alvoTipo: string, alvoChave: string): string {
    const o = orcamentos.find((o) => o.alvoTipo === alvoTipo && o.alvoChave === alvoChave);
    return o ? o.valor : "";
  }

  async function salvar(alvoTipo: string, alvoChave: string, valor: number, categoriaId?: string) {
    await apiFetch("/api/orcamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alvoTipo, alvoChave, mes, valor, categoriaId }),
    });
    carregar();
  }

  function toggleBloco(bloco: string) {
    setAbertos((prev) => {
      const next = new Set(prev);
      next.has(bloco) ? next.delete(bloco) : next.add(bloco);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Orçamento</h1>
        <input type="month" className="input w-auto text-sm" value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>

      <p className="text-sm text-gray-500">
        Defina uma linha de base por bloco inteiro ou por categoria — conforme as despesas do mês forem surgindo, elas vão sendo abatidas
        automaticamente na tela da DRE.
      </p>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="space-y-2">
          {DRE_BLOCOS.map((bloco) => {
            const categoriasDoBloco = categorias.filter((c) => c.bloco === bloco);
            const aberto = abertos.has(bloco);
            return (
              <div key={bloco} className="card">
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => toggleBloco(bloco)} className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 min-w-0 flex-1 text-left">
                    {aberto ? <ChevronUp className="w-4 h-4 flex-shrink-0 text-gray-400" /> : <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />}
                    <span className="truncate">{DRE_BLOCO_LABELS[bloco]}</span>
                  </button>
                  <ValorInput valorInicial={valorDe("BLOCO", bloco)} onSalvar={(v) => salvar("BLOCO", bloco, v)} />
                </div>

                {aberto && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 pl-5">
                    {categoriasDoBloco.length === 0 ? (
                      <p className="text-xs text-gray-400">Nenhuma categoria neste bloco.</p>
                    ) : (
                      categoriasDoBloco.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-gray-600 truncate">{c.nome}</span>
                          <ValorInput valorInicial={valorDe("CATEGORIA", c.id)} onSalvar={(v) => salvar("CATEGORIA", c.id, v, c.id)} />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
