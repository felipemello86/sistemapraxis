"use client";

import { useState, useTransition } from "react";
import {
  createCategoryAction,
  toggleCategoryActiveAction,
  updateTargetScoreAction,
} from "@/app/(app)/configuracoes/actions";
import { unwrapSafeAction } from "@/lib/safeAction";

export type CategoryItem = { id: string; name: string; active: boolean };

// Tela reduzida a só o que é específico do módulo Avaliações — Usuários e
// Propriedades ficaram no gateway (ver comentário em actions.ts). Estilo
// (cards brancos com borda, inputs cinza) segue o resto do módulo em vez do
// layout de formulários soltos do v1.
export function ConfiguracoesClient({
  isMaster,
  targetScore,
  categories,
}: {
  isMaster: boolean;
  targetScore: number;
  categories: CategoryItem[];
}) {
  const [scoreInput, setScoreInput] = useState(String(targetScore));
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [isScorePending, startScoreTransition] = useTransition();

  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isCategoryPending, startCategoryTransition] = useTransition();

  function handleSaveScore(e: React.FormEvent) {
    e.preventDefault();
    setScoreError(null);
    setScoreSaved(false);
    const value = Number(scoreInput.replace(",", "."));
    if (Number.isNaN(value) || value < 0 || value > 5) {
      setScoreError("Informe um valor entre 0 e 5.");
      return;
    }
    startScoreTransition(async () => {
      try {
        unwrapSafeAction(await updateTargetScoreAction(value));
        setScoreSaved(true);
        setTimeout(() => setScoreSaved(false), 2500);
      } catch (err) {
        setScoreError(err instanceof Error ? err.message : "Erro ao salvar a meta.");
      }
    });
  }

  function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    setCategoryError(null);
    startCategoryTransition(async () => {
      try {
        unwrapSafeAction(await createCategoryAction(categoryName));
        setCategoryName("");
      } catch (err) {
        setCategoryError(err instanceof Error ? err.message : "Erro ao criar categoria.");
      }
    });
  }

  function handleToggleCategory(categoryId: string, active: boolean) {
    startCategoryTransition(async () => {
      try {
        unwrapSafeAction(await toggleCategoryActiveAction(categoryId, active));
      } catch (err) {
        setCategoryError(err instanceof Error ? err.message : "Erro ao atualizar categoria.");
      }
    });
  }

  return (
    <div className="space-y-4 max-w-xl">
      {isMaster && (
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Meta de nota (Valor Meta)</h2>
          <p className="text-xs text-slate-400 mb-3">
            Usada como referência no Painel de Avaliações (linha "Meta" no gráfico).
          </p>
          <form onSubmit={handleSaveScore} className="flex items-center gap-2">
            <input
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              inputMode="decimal"
              className="w-28 text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
            <button
              type="submit"
              disabled={isScorePending}
              className="text-sm bg-blue-600 text-white rounded-md px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60"
            >
              {isScorePending ? "Salvando..." : "Salvar"}
            </button>
            {scoreSaved && <span className="text-xs text-green-600">✓ Salvo!</span>}
          </form>
          {scoreError && <p className="text-xs text-red-600 mt-2">{scoreError}</p>}
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Categorias</h2>
        <p className="text-xs text-slate-400 mb-3">
          Usadas na Análise & Planejamento pra classificar o motivo da avaliação. Clique numa
          categoria pra ativar/desativar (não fica mais disponível pra novas classificações, mas
          avaliações já categorizadas não mudam).
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={isCategoryPending}
              onClick={() => handleToggleCategory(c.id, !c.active)}
              className={
                "text-xs rounded-full px-3 py-1 border disabled:opacity-60 " +
                (c.active
                  ? "border-slate-200 text-slate-600 hover:border-slate-300"
                  : "border-slate-100 text-slate-300 line-through")
              }
            >
              {c.name}
            </button>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-slate-400">Nenhuma categoria cadastrada ainda.</p>
          )}
        </div>
        <form onSubmit={handleCreateCategory} className="flex gap-2">
          <input
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Nova categoria"
            className="text-sm border border-slate-300 rounded-md px-2 py-1.5 flex-1"
          />
          <button
            type="submit"
            disabled={isCategoryPending}
            className="text-sm bg-blue-600 text-white rounded-md px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
        {categoryError && <p className="text-xs text-red-600 mt-2">{categoryError}</p>}
      </section>
    </div>
  );
}
