"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatDateOnlyBR, isDateOnlyPast, localDayFromDateOnly } from "@/lib/dateOnly";
import type { Attendant, CategoryOption, KanbanReview, UHOption } from "./types";
import {
  addEfficacyCheckAction,
  addManagerialNoteAction,
  addReviewAttachmentAction,
  completeExecutionAction,
  deleteEfficacyCheckAction,
  deleteManagerialNoteAction,
  deleteReviewAction,
  deleteReviewAttachmentAction,
  finalizeFiveStarAnalysisAction,
  finalizeReviewAction,
  moveDirectToFinalAction,
  recordEfficacyAction,
  rejectPlanningAction,
  reopenAnalysisAction,
  saveAnalysisAction,
  saveAnalysisDraftAction,
  startAnalysisAction,
  toggleActionItemAction,
  updateEfficacyCheckAction,
  updateManagerialNoteAction,
  updateReviewUHAction,
} from "@/app/(app)/tratamento/actions";
import { rejectIfSafeActionFailed, unwrapSafeAction } from "@/lib/safeAction";

// Portado de apps/booking-reviews/src/components/kanban/CardDetailDrawer.tsx
// (v1) — únicas mudanças são as renomeações de propriedade → UH
// (propertyId→uhId, propertyLabel→uhNumero, PropertyOption→UHOption,
// updateReviewPropertyAction→updateReviewUHAction) e o texto do log
// PROPRIEDADE_ALTERADA (mantido igual, é só rótulo de exibição). O resto do
// fluxo (estágios, plano de ação, eficácia, anexos, observações) é idêntico
// ao v1 — nada de ReworkRequest aqui, a UI nunca chegou a usar esse model.

const FINAL_THRESHOLD = 4.75;

// Rótulos amigáveis para os códigos de ação gravados em ReviewLog.
const LOG_ACTION_LABEL: Record<string, string> = {
  CRIADA: "Avaliação criada",
  ANALISE_INICIADA: "Análise & Planejamento iniciada",
  ANALISE_CONCLUIDA: "Análise & Planejamento concluída",
  FINALIZADA_AUTOMATICA: "Finalizada automaticamente (nota máxima)",
  FINALIZADA_NOTA_MAXIMA: "Finalizada (nota máxima)",
  PLANEJAMENTO_REABERTO: "Planejamento reaberto para edição",
  PLANEJAMENTO_REJEITADO: "Planejamento rejeitado",
  EXECUCAO_CONCLUIDA: "Execução concluída",
  FINALIZADA: "Avaliação finalizada",
  PROPRIEDADE_ALTERADA: "Propriedade alterada",
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CardDetailDrawer({
  review,
  attendants,
  categories,
  uhs,
  currentUserRole,
  currentUserId,
  onClose,
}: {
  review: KanbanReview;
  attendants: Attendant[];
  categories: CategoryOption[];
  uhs: UHOption[];
  currentUserRole: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedAttendants, setSelectedAttendants] = useState<
    { attendantId: string; score: number; observation: string }[]
  >(
    review.attendants.length > 0
      ? review.attendants.map((a) => ({
          attendantId: a.attendantId,
          score: a.score,
          observation: a.observation,
        }))
      : []
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(review.categoryIds);
  const [actionItems, setActionItems] = useState<{ description: string; dueDate: string }[]>(
    review.actionItems.length > 0
      ? review.actionItems.map((i) => ({
          description: i.description,
          dueDate: i.dueDate.slice(0, 10),
        }))
      : [{ description: "", dueDate: todayInputValue() }]
  );
  // Sem valor padrão pré-preenchido: cada avaliação de eficácia (inclusive a
  // primeira) precisa ser adicionada manualmente pelo Gerente/Master, com
  // data e descrição do que será analisado.
  const [efficacyPlans, setEfficacyPlans] = useState<
    { scheduledDate: string; description: string }[]
  >(
    review.efficacyChecks.map((e) => ({
      scheduledDate: e.scheduledDate.slice(0, 10),
      description: e.description ?? "",
    }))
  );

  const canEditAnalysis = review.stage === "ANALISE_PLANEJAMENTO";
  // Nota máxima não precisa do processo completo (categorização, plano de
  // ação, plano de eficácia) — só a avaliação de atendimento é exigida, e o
  // card já finaliza direto (ver finalizeFiveStarAnalysisAction).
  const isMaxScore = review.ratingNormalized >= FINAL_THRESHOLD;

  // Detecta alterações não salvas na Análise & Planejamento pra poder
  // avisar/auto-salvar antes de fechar o card — evita perder trabalho já
  // feito só porque a pessoa clicou fora da janela.
  const isFirstRender = useRef(true);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setDirty(true);
  }, [selectedAttendants, categoryIds, actionItems, efficacyPlans]);

  function draftInput() {
    return {
      reviewId: review.id,
      attendants: selectedAttendants,
      categoryIds,
      actionItems,
      efficacyPlans,
    };
  }

  function handleSaveDraft() {
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await saveAnalysisDraftAction(draftInput()));
        setDirty(false);
        setLastSavedAt(new Date());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar rascunho.");
      }
    });
  }

  function handleClose() {
    if (canEditAnalysis && dirty) {
      startTransition(async () => {
        try {
          await saveAnalysisDraftAction(draftInput());
        } catch {
          // melhor fechar mesmo se o auto-save falhar do que travar a pessoa
        } finally {
          onClose();
        }
      });
    } else {
      onClose();
    }
  }

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        rejectIfSafeActionFailed(await fn());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ocorreu um erro.");
      }
    });
  }

  const canDeleteCard = currentUserRole === "MASTER" || currentUserRole === "GERENTE";
  // Mesma regra pra incluir/editar/excluir avaliações de eficácia e pra
  // reabrir o planejamento — Gerente e Master fazem direto, sem precisar de
  // autorização de mais ninguém.
  const canManagePlan = currentUserRole === "MASTER" || currentUserRole === "GERENTE";

  function handleDelete() {
    if (
      !confirm(
        `Excluir a avaliação de ${review.guestName} definitivamente? Essa ação não pode ser desfeita e Master e Gerente serão avisados.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await deleteReviewAction(review.id));
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir avaliação.");
      }
    });
  }

  function toggleAttendant(attendantId: string) {
    setSelectedAttendants((prev) => {
      const exists = prev.find((a) => a.attendantId === attendantId);
      if (exists) return prev.filter((a) => a.attendantId !== attendantId);
      return [...prev, { attendantId, score: 5, observation: "" }];
    });
  }

  function updateAttendant(attendantId: string, patch: Partial<{ score: number; observation: string }>) {
    setSelectedAttendants((prev) =>
      prev.map((a) => (a.attendantId === attendantId ? { ...a, ...patch } : a))
    );
  }

  const allExecutionDone =
    review.actionItems.length > 0 && review.actionItems.every((i) => i.completedAt);

  const allEfficacyDone =
    review.efficacyChecks.length > 0 && review.efficacyChecks.every((c) => c.completedAt);
  const allEfficacyEffective = review.efficacyChecks.every((c) => c.wasEffective);

  return (
    <div className="fixed inset-0 bg-black/30 flex justify-end z-50" onClick={handleClose}>
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{review.guestName}</h2>
            <p className="text-sm text-slate-500">
              {canManagePlan ? (
                <select
                  value={review.uhId}
                  disabled={isPending}
                  onChange={(e) => run(() => updateReviewUHAction(review.id, e.target.value))}
                  className="text-sm border border-slate-200 rounded-md px-1 py-0.5 -ml-1 bg-transparent"
                >
                  {uhs.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.numero}
                    </option>
                  ))}
                </select>
              ) : (
                review.uhNumero ?? "—"
              )}{" "}
              · {review.platform} · {new Date(review.guestSubmittedAt).toLocaleDateString("pt-BR")}
              {review.checkInDate && <> · check-in {formatDateOnlyBR(review.checkInDate)}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-slate-700">
              {review.ratingNormalized.toFixed(2)}
            </span>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
              ×
            </button>
          </div>
        </div>

        <AttachmentsPanel
          reviewId={review.id}
          attachments={review.attachments}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />

        {canDeleteCard && (
          <div className="mb-5 -mt-2">
            <button
              disabled={isPending}
              onClick={handleDelete}
              className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
            >
              🗑 Excluir avaliação
            </button>
          </div>
        )}

        <p className="text-sm text-slate-600 bg-slate-50 rounded-md p-3 mb-5 whitespace-pre-wrap">
          {review.comment || "Sem comentário."}
        </p>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {/* RECEBIDA */}
        {review.stage === "RECEBIDA" && (
          <div className="space-y-3">
            <button
              disabled={isPending}
              onClick={() => run(() => startAnalysisAction(review.id))}
              className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
            >
              Iniciar Análise & Planejamento
            </button>
            {review.ratingNormalized >= FINAL_THRESHOLD && (
              <button
                disabled={isPending}
                onClick={() => run(() => moveDirectToFinalAction(review.id))}
                className="w-full rounded-md border border-green-300 text-green-700 text-sm font-medium py-2 hover:bg-green-50 disabled:opacity-60"
              >
                Nota máxima — mover direto para Finalizadas
              </button>
            )}
          </div>
        )}

        {/* ANALISE & PLANEJAMENTO */}
        {review.stage === "ANALISE_PLANEJAMENTO" && (
          <div className="space-y-6">
            {isMaxScore && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                Nota máxima — só a avaliação de atendimento é necessária aqui. Categorização, plano
                de ação e plano de eficácia não são exigidos.
              </div>
            )}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Atendente(s) envolvida(s)</h3>
              <div className="space-y-2">
                {attendants.map((a) => {
                  const selected = selectedAttendants.find((s) => s.attendantId === a.id);
                  return (
                    <div key={a.id} className="border border-slate-200 rounded-md p-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleAttendant(a.id)}
                        />
                        {a.name}
                      </label>
                      {selected && (
                        <div className="mt-2 pl-6 space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500">Nota (0-5):</label>
                            <select
                              value={selected.score}
                              onChange={(e) =>
                                updateAttendant(a.id, { score: Number(e.target.value) })
                              }
                              className="text-sm border border-slate-300 rounded-md px-2 py-1"
                            >
                              {[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => (
                                <option key={v} value={v}>
                                  {v.toFixed(1)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            placeholder="Observação (obrigatória)"
                            value={selected.observation}
                            onChange={(e) =>
                              updateAttendant(a.id, { observation: e.target.value })
                            }
                            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                            rows={2}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {attendants.length === 0 && (
                  <p className="text-xs text-slate-400">
                    Nenhuma atendente cadastrada. Cadastre em Configurações.
                  </p>
                )}
              </div>
            </section>

            {!isMaxScore && (
              <>
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Categorização</h3>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-full px-3 py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={() =>
                        setCategoryIds((prev) =>
                          prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Plano de Ação</h3>
              <div className="space-y-2">
                {actionItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      placeholder="Ação"
                      value={item.description}
                      onChange={(e) =>
                        setActionItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it))
                        )
                      }
                      className="flex-1 text-sm border border-slate-300 rounded-md px-2 py-1.5"
                    />
                    <input
                      type="date"
                      value={item.dueDate}
                      onChange={(e) =>
                        setActionItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, dueDate: e.target.value } : it))
                        )
                      }
                      className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
                    />
                    <button
                      onClick={() =>
                        setActionItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-slate-400 hover:text-red-600 text-sm"
                    >
                      remover
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setActionItems((prev) => [...prev, { description: "", dueDate: todayInputValue() }])
                  }
                  className="text-xs text-blue-600 hover:underline"
                >
                  + adicionar ação
                </button>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                Plano de Avaliação de Eficácia
              </h3>
              <div className="space-y-2">
                {efficacyPlans.map((plan, idx) => (
                  <div key={idx} className="flex gap-2 items-start border border-slate-200 rounded-md p-2">
                    <div className="flex-1 space-y-1.5">
                      <input
                        type="date"
                        value={plan.scheduledDate}
                        onChange={(e) =>
                          setEfficacyPlans((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, scheduledDate: e.target.value } : p))
                          )
                        }
                        className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
                      />
                      <textarea
                        placeholder="O que será analisado nessa data (obrigatório)"
                        value={plan.description}
                        onChange={(e) =>
                          setEfficacyPlans((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, description: e.target.value } : p))
                          )
                        }
                        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                        rows={2}
                      />
                    </div>
                    <button
                      onClick={() => setEfficacyPlans((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-600 text-sm"
                    >
                      remover
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setEfficacyPlans((prev) => [...prev, { scheduledDate: todayInputValue(), description: "" }])
                  }
                  className="text-xs text-blue-600 hover:underline"
                >
                  + adicionar data
                </button>
              </div>
            </section>

            <div className="flex items-center gap-2">
              <button
                disabled={isPending}
                onClick={handleSaveDraft}
                className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-60"
              >
                💾 Salvar rascunho
              </button>
              {!dirty && lastSavedAt && (
                <span className="text-xs text-slate-400">
                  Salvo às {lastSavedAt.toLocaleTimeString("pt-BR")}
                </span>
              )}
              {dirty && (
                <span className="text-xs text-amber-600">Alterações não salvas</span>
              )}
            </div>
              </>
            )}

            {isMaxScore ? (
              <button
                disabled={isPending || !canEditAnalysis}
                onClick={() =>
                  run(() =>
                    finalizeFiveStarAnalysisAction({
                      reviewId: review.id,
                      attendants: selectedAttendants,
                    })
                  )
                }
                className="w-full rounded-md bg-green-600 text-white text-sm font-medium py-2 hover:bg-green-700 disabled:opacity-60"
              >
                Concluir avaliação (nota máxima)
              </button>
            ) : (
              <button
                disabled={isPending || !canEditAnalysis}
                onClick={() =>
                  run(() =>
                    saveAnalysisAction({
                      reviewId: review.id,
                      attendants: selectedAttendants,
                      categoryIds,
                      actionItems,
                      efficacyPlans,
                    })
                  )
                }
                className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
              >
                Concluir Análise & Planejamento
              </button>
            )}
          </div>
        )}

        {/* EXECUCAO */}
        {review.stage === "EXECUCAO" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Plano de Ação</h3>
            <div className="space-y-2">
              {review.actionItems.map((item) => {
                const overdue = !item.completedAt && isDateOnlyPast(item.dueDate);
                return (
                  <label
                    key={item.id}
                    className={
                      "flex items-center gap-3 border rounded-md p-2 text-sm " +
                      (overdue ? "border-red-300 bg-red-50" : "border-slate-200")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={!!item.completedAt}
                      disabled={isPending}
                      onChange={(e) =>
                        run(() => toggleActionItemAction(item.id, e.target.checked))
                      }
                    />
                    <div className="flex-1">
                      <div className="text-slate-700">{item.description}</div>
                      <div className={"text-xs " + (overdue ? "text-red-600" : "text-slate-400")}>
                        Prazo: {formatDateOnlyBR(item.dueDate)}
                        {item.completedAt &&
                          ` · concluída em ${new Date(item.completedAt).toLocaleDateString("pt-BR")}`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <EfficacyPlanSection
              reviewId={review.id}
              checks={review.efficacyChecks}
              canManage={canManagePlan}
              isPending={isPending}
              run={run}
            />

            <button
              disabled={isPending || !allExecutionDone}
              onClick={() => run(() => completeExecutionAction(review.id))}
              className="w-full rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
            >
              Concluir Execução
            </button>

            {(currentUserRole === "MASTER" || currentUserRole === "GERENTE") && (
              <button
                disabled={isPending}
                onClick={() => {
                  if (!confirm("Voltar este card para Análise & Planejamento? Master e Gerente serão avisados.")) return;
                  run(() => reopenAnalysisAction(review.id));
                }}
                className="w-full rounded-md border border-slate-300 text-slate-600 text-sm font-medium py-2 hover:bg-slate-50 disabled:opacity-60"
              >
                ↩ Editar planejamento (voltar para Análise & Planejamento)
              </button>
            )}

            {currentUserRole === "MASTER" && <RejectPlanningButton reviewId={review.id} />}
          </div>
        )}

        {/* AVALIACAO DA EFICACIA */}
        {review.stage === "AVALIACAO_EFICACIA" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Avaliação da Eficácia</h3>
            <EfficacyPlanSection
              reviewId={review.id}
              checks={review.efficacyChecks}
              canManage={canManagePlan}
              isPending={isPending}
              run={run}
            />

            {allEfficacyDone && allEfficacyEffective && (
              <button
                disabled={isPending}
                onClick={() => run(() => finalizeReviewAction(review.id))}
                className="w-full rounded-md bg-green-600 text-white text-sm font-medium py-2 hover:bg-green-700 disabled:opacity-60"
              >
                Finalizar
              </button>
            )}

            {canManagePlan && (
              <button
                disabled={isPending}
                onClick={() => {
                  if (!confirm("Voltar este card para Análise & Planejamento?")) return;
                  run(() => reopenAnalysisAction(review.id));
                }}
                className="w-full rounded-md border border-slate-300 text-slate-600 text-sm font-medium py-2 hover:bg-slate-50 disabled:opacity-60"
              >
                ↩ Editar planejamento (voltar para Análise & Planejamento)
              </button>
            )}

            {currentUserRole === "MASTER" && <RejectPlanningButton reviewId={review.id} />}
          </div>
        )}

        {/* FINALIZADA */}
        {review.stage === "FINALIZADA" && (
          <div className="space-y-4 text-sm text-slate-600">
            <p className="text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              Avaliação finalizada.
            </p>
            {review.attendants.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-700 mb-1">Atendentes avaliadas</h4>
                {review.attendants.map((a) => (
                  <div key={a.attendantId} className="mb-1">
                    {a.name} — {a.score.toFixed(1)}★ — {a.observation}
                  </div>
                ))}
              </div>
            )}
            {review.actionItems.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-700 mb-1">Plano de ação</h4>
                {review.actionItems.map((i) => (
                  <div key={i.id}>
                    ✓ {i.description} (prazo {formatDateOnlyBR(i.dueDate)})
                  </div>
                ))}
              </div>
            )}

            {currentUserRole === "MASTER" && <RejectPlanningButton reviewId={review.id} />}
          </div>
        )}

        <ManagerialNotesSection
          reviewId={review.id}
          notes={review.managerialNotes}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />

        <ReviewLogSection logs={review.logs} />
      </div>
    </div>
  );
}

// Botão pelo qual o Master rejeita o planejamento elaborado pelo Gerente
// (a partir de Execução, Avaliação da Eficácia ou Finalizadas), obrigando a
// uma justificativa. O card volta para Análise & Planejamento e o motivo
// aparece nas Observações gerenciais + no log do card.
function RejectPlanningButton({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!reason.trim()) return;
    if (!confirm("Rejeitar o planejamento deste card? Ele volta para Análise & Planejamento e o Gerente será avisado.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await rejectPlanningAction(reviewId, reason));
        setReason("");
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao rejeitar planejamento.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-red-300 text-red-700 text-sm font-medium py-2 hover:bg-red-50"
      >
        ⛔ Rejeitar Planejamento
      </button>
    );
  }

  return (
    <div className="border border-red-200 rounded-md p-3 bg-red-50/50 space-y-2">
      <label className="text-xs font-medium text-red-700">
        Por que o planejamento está sendo rejeitado? (obrigatório)
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
        placeholder="Ex.: plano de ação não ataca a causa raiz, precisa incluir treinamento X..."
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={isPending || !reason.trim()}
          onClick={handleSubmit}
          className="text-xs bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 disabled:opacity-60"
        >
          Confirmar rejeição
        </button>
        <button
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="text-xs text-slate-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Histórico automático e não editável de tudo que aconteceu com o card —
// visível a qualquer papel, mesmo padrão do "Log do card" de Reuniões de
// Performance.
function ReviewLogSection({ logs }: { logs: KanbanReview["logs"] }) {
  return (
    <section className="mt-8 pt-6 border-t border-slate-200">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Log do card</h3>
      <div className="space-y-1.5">
        {logs.length === 0 && <p className="text-xs text-slate-400">Sem atividade registrada.</p>}
        {logs.map((l) => (
          <div key={l.id} className="text-xs text-slate-500 border-l-2 border-slate-200 pl-2">
            <span className="font-medium text-slate-600">{LOG_ACTION_LABEL[l.action] ?? l.action}</span>
            {l.detail && <span> — {l.detail}</span>}
            <span className="text-slate-400">
              {" "}
              · {l.actorName} · {new Date(l.createdAt).toLocaleString("pt-BR")}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Acesso aos anexos (imagens/documentos) fica no topo do card: um botão
// compacto com a contagem que expande um painel de upload/visualização/
// exclusão. Qualquer usuário autenticado pode anexar; só quem subiu (ou
// Master/Gerente) pode excluir.
function AttachmentsPanel({
  reviewId,
  attachments,
  currentUserId,
  currentUserRole,
}: {
  reviewId: string;
  attachments: KanbanReview["attachments"];
  currentUserId: string;
  currentUserRole: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManage = currentUserRole === "MASTER" || currentUserRole === "GERENTE";

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        rejectIfSafeActionFailed(await fn());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ocorreu um erro.");
      }
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      setError("Arquivo muito grande (máximo 4,5 MB).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("file", file);
    run(async () => {
      const result = await addReviewAttachmentAction(fd);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return result;
    });
  }

  return (
    <div className="mb-5 -mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1"
      >
        📎 {attachments.length > 0 ? `${attachments.length} anexo(s)` : "Anexar arquivo"}
        <span className="text-slate-300">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 border border-slate-200 rounded-md p-3 bg-slate-50/60">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-2">
              {error}
            </div>
          )}
          <div className="space-y-2 mb-2">
            {attachments.length === 0 && (
              <p className="text-xs text-slate-400">Nenhum anexo ainda.</p>
            )}
            {attachments.map((a) => {
              const canDelete = a.uploadedById === currentUserId || canManage;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-sm"
                >
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate"
                  >
                    📎 {a.fileName}
                  </a>
                  <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0 ml-2">
                    <span>{formatBytes(a.fileSize)}</span>
                    <span>{a.uploadedByName}</span>
                    {canDelete && (
                      <button
                        onClick={() => {
                          if (!confirm(`Excluir o anexo "${a.fileName}"?`)) return;
                          run(() => deleteReviewAttachmentAction(a.id));
                        }}
                        disabled={isPending}
                        className="hover:text-red-600"
                      >
                        excluir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            disabled={isPending}
            className="text-xs text-slate-600"
          />
          <p className="text-xs text-slate-400 mt-1">Imagens ou documentos, máximo 4,5 MB por arquivo.</p>
        </div>
      )}
    </div>
  );
}

function ManagerialNotesSection({
  reviewId,
  notes,
  currentUserId,
  currentUserRole,
}: {
  reviewId: string;
  notes: KanbanReview["managerialNotes"];
  currentUserId: string;
  currentUserRole: string;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await addManagerialNoteAction(reviewId, text));
        setText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar observação.");
      }
    });
  }

  function startEdit(noteId: string, currentText: string) {
    setEditingId(noteId);
    setEditText(currentText);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function handleUpdate(noteId: string) {
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await updateManagerialNoteAction(noteId, editText));
        setEditingId(null);
        setEditText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao editar observação.");
      }
    });
  }

  function handleDelete(noteId: string) {
    if (!confirm("Excluir esta observação?")) return;
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await deleteManagerialNoteAction(noteId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir observação.");
      }
    });
  }

  return (
    <section className="mt-8 pt-6 border-t border-slate-200">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Observações gerenciais</h3>

      <div className="space-y-2 mb-3">
        {notes.length === 0 && (
          <p className="text-xs text-slate-400">Nenhuma observação registrada ainda.</p>
        )}
        {notes.map((n) => {
          const isAuthor = n.authorId === currentUserId;
          const canDelete = isAuthor || currentUserRole === "MASTER" || currentUserRole === "GERENTE";
          const isEditing = editingId === n.id;

          return (
            <div key={n.id} className="bg-slate-50 border border-slate-200 rounded-md p-2 text-sm">
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(n.id)}
                      disabled={isPending || !editText.trim()}
                      className="text-xs bg-blue-600 text-white rounded-md px-3 py-1 hover:bg-blue-700 disabled:opacity-60"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={isPending}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-slate-700 whitespace-pre-wrap">{n.text}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-slate-400">
                      {n.authorName} · {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </p>
                    <div className="flex gap-2">
                      {isAuthor && (
                        <button
                          onClick={() => startEdit(n.id, n.text)}
                          disabled={isPending}
                          className="text-xs text-slate-400 hover:text-blue-600"
                        >
                          editar
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(n.id)}
                          disabled={isPending}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          excluir
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Adicionar uma observação..."
          rows={2}
          className="flex-1 text-sm border border-slate-300 rounded-md px-2 py-1.5"
        />
        <button
          onClick={handleAdd}
          disabled={isPending || !text.trim()}
          className="self-end text-sm bg-blue-600 text-white rounded-md px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Adicionar"}
        </button>
      </div>
    </section>
  );
}

// Seção completa do Plano de Avaliação de Eficácia — usada tanto na etapa de
// Execução quanto na de Avaliação da Eficácia. Permite registrar o resultado
// de cada avaliação já vencida (efetivo/não efetivo) e, pra Gerente/Master,
// incluir, editar e excluir avaliações planejadas a qualquer momento nessas
// duas etapas.
function EfficacyPlanSection({
  reviewId,
  checks,
  canManage,
  isPending,
  run,
}: {
  reviewId: string;
  checks: KanbanReview["efficacyChecks"];
  canManage: boolean;
  isPending: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDate, setNewDate] = useState(todayInputValue());
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");

  function startEdit(check: KanbanReview["efficacyChecks"][number]) {
    setEditingId(check.id);
    setEditDate(check.scheduledDate.slice(0, 10));
    setEditDescription(check.description ?? "");
  }

  function handleAdd() {
    if (!newDate || !newDescription.trim()) return;
    run(() => addEfficacyCheckAction(reviewId, newDate, newDescription));
    setNewDate(todayInputValue());
    setNewDescription("");
    setShowAddForm(false);
  }

  function handleSaveEdit(checkId: string) {
    if (!editDate || !editDescription.trim()) return;
    run(() => updateEfficacyCheckAction(checkId, editDate, editDescription));
    setEditingId(null);
  }

  function handleDelete(checkId: string) {
    if (!confirm("Excluir esta avaliação de eficácia planejada?")) return;
    run(() => deleteEfficacyCheckAction(checkId));
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Plano de Avaliação de Eficácia</h3>
      <div className="space-y-2">
        {checks.map((check) =>
          editingId === check.id ? (
            <div key={check.id} className="border border-slate-200 rounded-md p-2 space-y-1.5">
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
              <textarea
                placeholder="O que será analisado nessa data"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  disabled={isPending || !editDate || !editDescription.trim()}
                  onClick={() => handleSaveEdit(check.id)}
                  className="text-xs bg-blue-600 text-white rounded-md px-3 py-1 hover:bg-blue-700 disabled:opacity-60"
                >
                  Salvar
                </button>
                <button
                  disabled={isPending}
                  onClick={() => setEditingId(null)}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <EfficacyRow
              key={check.id}
              check={check}
              isPending={isPending}
              run={run}
              canManage={canManage}
              onEdit={() => startEdit(check)}
              onDelete={() => handleDelete(check.id)}
            />
          )
        )}
        {checks.length === 0 && (
          <p className="text-xs text-slate-400">Nenhuma avaliação de eficácia planejada.</p>
        )}
      </div>

      {canManage &&
        (showAddForm ? (
          <div className="border border-slate-200 rounded-md p-2 space-y-1.5 mt-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
            <textarea
              placeholder="O que será analisado nessa data"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                disabled={isPending || !newDate || !newDescription.trim()}
                onClick={handleAdd}
                className="text-xs bg-blue-600 text-white rounded-md px-3 py-1 hover:bg-blue-700 disabled:opacity-60"
              >
                Adicionar
              </button>
              <button
                disabled={isPending}
                onClick={() => setShowAddForm(false)}
                className="text-xs text-slate-500 hover:underline"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-xs text-blue-600 hover:underline mt-2"
          >
            + adicionar avaliação de eficácia
          </button>
        ))}
    </section>
  );
}

function EfficacyRow({
  check,
  isPending,
  run,
  canManage,
  onEdit,
  onDelete,
}: {
  check: KanbanReview["efficacyChecks"][number];
  isPending: boolean;
  run: (fn: () => Promise<unknown>) => void;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(check.notes ?? "");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDue = localDayFromDateOnly(check.scheduledDate).getTime() <= today.getTime();

  if (check.completedAt) {
    return (
      <div className="border border-slate-200 rounded-md p-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-slate-700">
              {formatDateOnlyBR(check.scheduledDate)} —{" "}
              {check.wasEffective ? (
                <span className="text-green-700 font-medium">Efetivo</span>
              ) : (
                <span className="text-red-700 font-medium">Não efetivo</span>
              )}
            </div>
            {check.description && (
              <div className="text-xs text-slate-500 mt-1">O que foi analisado: {check.description}</div>
            )}
            {check.notes && <div className="text-xs text-slate-500 mt-1">{check.notes}</div>}
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button onClick={onEdit} disabled={isPending} className="text-xs text-slate-400 hover:text-blue-600">
                editar
              </button>
              <button onClick={onDelete} disabled={isPending} className="text-xs text-slate-400 hover:text-red-600">
                excluir
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-md p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-slate-700">
          Data agendada: {formatDateOnlyBR(check.scheduledDate)}
          {!isDue && <span className="text-xs text-slate-400"> (ainda não chegou)</span>}
        </div>
        {canManage && (
          <div className="flex gap-2 shrink-0">
            <button onClick={onEdit} disabled={isPending} className="text-xs text-slate-400 hover:text-blue-600">
              editar
            </button>
            <button onClick={onDelete} disabled={isPending} className="text-xs text-slate-400 hover:text-red-600">
              excluir
            </button>
          </div>
        )}
      </div>
      {check.description && (
        <div className="text-xs text-slate-500">O que analisar: {check.description}</div>
      )}
      <textarea
        placeholder="Notas sobre a eficácia"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={() => run(() => recordEfficacyAction(check.id, true, notes))}
          className="text-xs rounded-md bg-green-600 text-white px-3 py-1.5 hover:bg-green-700 disabled:opacity-60"
        >
          Foi efetivo
        </button>
        <button
          disabled={isPending}
          onClick={() => run(() => recordEfficacyAction(check.id, false, notes))}
          className="text-xs rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 disabled:opacity-60"
        >
          Não foi efetivo
        </button>
      </div>
    </div>
  );
}
