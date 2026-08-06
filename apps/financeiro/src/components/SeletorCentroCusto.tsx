"use client";
import { useEffect, useState } from "react";

// Seletor de Centro de Custo compartilhado (Administração -> Empreendimento
// -> Unidade, pedido do Felipe, 05/08/2026) — nasceu em LancamentosView,
// extraído em 06/08/2026 pra ser reaproveitado também no card "Novo
// lançamento" da tela de Conciliações. Administração e Empreendimento
// rateiam o custo na DRE (ver lib/finance/centro-de-custo.ts em
// @praxis/core); Unidade não rateia, vai 100% pra ela.
//
// Unidade em cascata (pedido do Felipe, 06/08/2026): antes era um único
// <select> com TODAS as unidades de TODOS os empreendimentos misturadas
// ("Prédio — 101", "Prédio — 102", "Outro Prédio — 201"...), confuso com
// muitas unidades. Agora primeiro escolhe o Empreendimento, só depois
// aparece o <select> de Unidade (já filtrado). O filtro em si é estado
// PRÓPRIO deste componente (`empreendimentoFiltro`) — não existe no
// contrato onChange porque o valor final que importa pra quem usa isto é
// só `unidadeId` (o empreendimento dela já vem no próprio objeto Unidade).
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
  const [empreendimentoFiltro, setEmpreendimentoFiltro] = useState("");

  // Se já existe uma unidade selecionada (ex.: editando um lançamento
  // existente), deriva o empreendimento dela pra abrir a cascata já no
  // lugar certo, em vez de forçar escolher tudo de novo do zero.
  useEffect(() => {
    if (tipo === "UNIDADE" && unidadeId) {
      const u = unidades.find((u) => u.id === unidadeId);
      if (u) setEmpreendimentoFiltro(u.empreendimentoId);
    }
    if (tipo !== "UNIDADE") setEmpreendimentoFiltro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, unidadeId]);

  const unidadesDoEmpreendimento = unidades.filter((u) => u.empreendimentoId === empreendimentoFiltro);

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
            onClick={() => {
              setEmpreendimentoFiltro("");
              onChange({ centroCustoTipo: v, empreendimentoId: null, unidadeId: null });
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${tipo === v ? "bg-blue-700 text-white border-blue-700" : "border-gray-300 text-gray-600"}`}
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
        <div className="space-y-2">
          <select
            className="input text-sm"
            value={empreendimentoFiltro}
            onChange={(e) => {
              setEmpreendimentoFiltro(e.target.value);
              onChange({ centroCustoTipo: "UNIDADE", empreendimentoId: null, unidadeId: null }); // troca de empreendimento limpa a unidade escolhida
            }}
          >
            <option value="">Selecione o empreendimento...</option>
            {empreendimentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
          {empreendimentoFiltro && (
            <select className="input text-sm" value={unidadeId || ""} onChange={(e) => onChange({ centroCustoTipo: "UNIDADE", empreendimentoId: null, unidadeId: e.target.value || null })}>
              <option value="">Selecione a unidade...</option>
              {unidadesDoEmpreendimento.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
