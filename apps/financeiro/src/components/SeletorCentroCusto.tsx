"use client";

// Seletor de Centro de Custo compartilhado (Administração -> Empreendimento
// -> Unidade, pedido do Felipe, 05/08/2026) — nasceu em LancamentosView,
// extraído em 06/08/2026 pra ser reaproveitado também no card "Novo
// lançamento" da tela de Conciliações. Administração e Empreendimento
// rateiam o custo na DRE (ver lib/finance/centro-de-custo.ts em
// @praxis/core); Unidade não rateia, vai 100% pra ela.

export type Empreendimento = { id: string; nome: string };
export type Unidade = { id: string; nome: string; empreendimentoId: string; empreendimento: string };

export function SeletorCentroCusto({
  tipo,
  empreendimentoId,
  unidadeId,
  empreendimentos,
  unidades,
  onChange,
}: {
  tipo: string;
  empreendimentoId: string | null;
  unidadeId: string | null;
  empreendimentos: Empreendimento[];
  unidades: Unidade[];
  onChange: (v: { centroCustoTipo: "ADMINISTRACAO" | "EMPREENDIMENTO" | "UNIDADE"; empreendimentoId: string | null; unidadeId: string | null }) => void;
}) {
  return (
    <div>
      <label className="label">Centro de custo</label>
      <div className="flex gap-2 mb-2">
        {(
          [
            ["ADMINISTRACAO", "Administração"],
            ["EMPREENDIMENTO", "Empreendimento"],
            ["UNIDADE", "Unidade"],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ centroCustoTipo: v, empreendimentoId: null, unidadeId: null })}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${tipo === v ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {tipo === "EMPREENDIMENTO" && (
        <select
          className="input text-sm"
          value={empreendimentoId || ""}
          onChange={(e) => onChange({ centroCustoTipo: "EMPREENDIMENTO", empreendimentoId: e.target.value || null, unidadeId: null })}
        >
          <option value="">Selecione o empreendimento...</option>
          {empreendimentos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      )}
      {tipo === "UNIDADE" && (
        <select className="input text-sm" value={unidadeId || ""} onChange={(e) => onChange({ centroCustoTipo: "UNIDADE", empreendimentoId: null, unidadeId: e.target.value || null })}>
          <option value="">Selecione a unidade...</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.empreendimento} — {u.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
