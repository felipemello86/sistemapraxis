// Portado de apps/booking-reviews/src/components/reunioes/types.ts (v1)
// verbatim.

export type MeetingUserOption = { id: string; name: string; role: string };

export type MeetingNote = {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};

export type MeetingAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
};

export type MeetingLogEntry = {
  id: string;
  action: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

export type Meeting = {
  id: string;
  date: string; // ISO
  coordinatorId: string;
  coordinatorName: string;
  participantIds: string[];
  participantNames: string[];
  notes: MeetingNote[];
  attachments: MeetingAttachment[];
  logs: MeetingLogEntry[];
};

export const LOG_ACTION_LABEL: Record<string, string> = {
  CRIADA: "Reunião criada",
  COORDENADOR_ALTERADO: "Coordenador alterado",
  DATA_ALTERADA: "Data alterada",
  PARTICIPANTES_ATUALIZADOS: "Participantes atualizados",
  OBSERVACAO_ADICIONADA: "Observação adicionada",
  ANEXO_ADICIONADO: "Anexo adicionado",
  ANEXO_REMOVIDO: "Anexo removido",
};
