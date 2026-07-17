"use client";

// Portado de apps/booking-reviews/src/components/reunioes/MeetingDetailDrawer.tsx
// (v1) — só o `run()` interno muda: as actions agora devolvem um
// SafeActionResult em vez de lançar direto (ver src/lib/safeAction.ts),
// então usa rejectIfSafeActionFailed pra continuar convertendo erro em
// mensagem no catch — mesmo padrão usado em CardDetailDrawer.tsx
// (Tratamento). `saveMeetingAction` aqui é chamada só pra editar (o retorno
// do id não importa nesse caso), diferente de CreateMeetingModal.

import { useRef, useState, useTransition } from "react";
import {
  addMeetingAttachmentAction,
  addMeetingNoteAction,
  deleteMeetingAction,
  deleteMeetingAttachmentAction,
  deleteMeetingNoteAction,
  saveMeetingAction,
  updateMeetingNoteAction,
} from "@/app/(app)/reunioes/actions";
import { localDayFromDateOnly } from "@/lib/dateOnly";
import { rejectIfSafeActionFailed } from "@/lib/safeAction";
import { LOG_ACTION_LABEL, type Meeting, type MeetingUserOption } from "./types";

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MeetingDetailDrawer({
  meeting,
  users,
  currentUserRole,
  currentUserId,
  onClose,
}: {
  meeting: Meeting;
  users: MeetingUserOption[];
  currentUserRole: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canManage = currentUserRole === "MASTER" || currentUserRole === "GERENTE";

  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(meeting.date.slice(0, 10));
  const [coordinatorId, setCoordinatorId] = useState(meeting.coordinatorId);
  const [participantIds, setParticipantIds] = useState<string[]>(meeting.participantIds);

  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
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

  function handleSaveDetails() {
    run(async () => {
      await saveMeetingAction({ meetingId: meeting.id, date, coordinatorId, participantIds });
      setEditing(false);
    });
  }

  function handleDeleteMeeting() {
    if (!confirm("Excluir esta reunião definitivamente? Observações e anexos também serão apagados.")) {
      return;
    }
    run(async () => {
      await deleteMeetingAction(meeting.id);
      onClose();
    });
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    run(async () => {
      await addMeetingNoteAction(meeting.id, noteText);
      setNoteText("");
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
    fd.set("meetingId", meeting.id);
    fd.set("file", file);
    run(async () => {
      await addMeetingAttachmentAction(fd);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex justify-end z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Reunião de {localDayFromDateOnly(meeting.date).toLocaleDateString("pt-BR")}
            </h2>
            <p className="text-sm text-slate-500">Coordenação: {meeting.coordinatorName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
            ×
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {/* Coordenador / Participantes */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Coordenador &amp; Participantes</h3>
            {canManage && !editing && (
              <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">
                editar
              </button>
            )}
          </div>

          {!editing ? (
            <div className="text-sm text-slate-600 space-y-1">
              <p>
                <span className="text-slate-400">Coordenador:</span> {meeting.coordinatorName}
              </p>
              <p>
                <span className="text-slate-400">Participantes:</span>{" "}
                {meeting.participantNames.length > 0 ? meeting.participantNames.join(", ") : "nenhum"}
              </p>
            </div>
          ) : (
            <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-md p-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Coordenador</label>
                <select
                  value={coordinatorId}
                  onChange={(e) => setCoordinatorId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Participantes</label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1 bg-white">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={participantIds.includes(u.id)}
                        onChange={() => toggleParticipant(u.id)}
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={isPending}
                  onClick={handleSaveDetails}
                  className="text-xs bg-blue-600 text-white rounded-md px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60"
                >
                  Salvar
                </button>
                <button
                  disabled={isPending}
                  onClick={() => {
                    setEditing(false);
                    setDate(meeting.date.slice(0, 10));
                    setCoordinatorId(meeting.coordinatorId);
                    setParticipantIds(meeting.participantIds);
                  }}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Observações */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Observações</h3>
          <div className="space-y-2 mb-3">
            {meeting.notes.length === 0 && (
              <p className="text-xs text-slate-400">Nenhuma observação registrada ainda.</p>
            )}
            {meeting.notes.map((n) => {
              const isAuthor = n.authorId === currentUserId;
              const canDelete = isAuthor || canManage;
              const isEditingThis = editingNoteId === n.id;
              return (
                <div key={n.id} className="bg-slate-50 border border-slate-200 rounded-md p-2 text-sm">
                  {isEditingThis ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        rows={2}
                        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={isPending || !editingNoteText.trim()}
                          onClick={() =>
                            run(async () => {
                              await updateMeetingNoteAction(n.id, editingNoteText);
                              setEditingNoteId(null);
                            })
                          }
                          className="text-xs bg-blue-600 text-white rounded-md px-3 py-1 hover:bg-blue-700 disabled:opacity-60"
                        >
                          Salvar
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => setEditingNoteId(null)}
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
                              onClick={() => {
                                setEditingNoteId(n.id);
                                setEditingNoteText(n.text);
                              }}
                              disabled={isPending}
                              className="text-xs text-slate-400 hover:text-blue-600"
                            >
                              editar
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                if (!confirm("Excluir esta observação?")) return;
                                run(() => deleteMeetingNoteAction(n.id));
                              }}
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
          <div className="flex gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Adicionar uma observação..."
              rows={2}
              className="flex-1 text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
            <button
              onClick={handleAddNote}
              disabled={isPending || !noteText.trim()}
              className="self-end text-sm bg-blue-600 text-white rounded-md px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60"
            >
              Adicionar
            </button>
          </div>
        </section>

        {/* Anexos */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Anexos</h3>
          <div className="space-y-2 mb-3">
            {meeting.attachments.length === 0 && (
              <p className="text-xs text-slate-400">Nenhum anexo ainda.</p>
            )}
            {meeting.attachments.map((a) => {
              const canDelete = a.uploadedById === currentUserId || canManage;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm"
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
                          run(() => deleteMeetingAttachmentAction(a.id));
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
            className="text-sm text-slate-600"
          />
          <p className="text-xs text-slate-400 mt-1">Máximo 4,5 MB por arquivo.</p>
        </section>

        {/* Log */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Log do card</h3>
          <div className="space-y-1.5">
            {meeting.logs.length === 0 && <p className="text-xs text-slate-400">Sem atividade registrada.</p>}
            {meeting.logs.map((l) => (
              <div key={l.id} className="text-xs text-slate-500 border-l-2 border-slate-200 pl-2">
                <span className="font-medium text-slate-600">{LOG_ACTION_LABEL[l.action] ?? l.action}</span>
                {l.detail && <span> — {l.detail}</span>}
                <span className="text-slate-400">
                  {" "}
                  · {l.actorName ?? "sistema"} · {new Date(l.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </section>

        {canManage && (
          <div className="pt-4 border-t border-slate-200">
            <button
              onClick={handleDeleteMeeting}
              disabled={isPending}
              className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
            >
              🗑 Excluir reunião
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
