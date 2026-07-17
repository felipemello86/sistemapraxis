// Portado de apps/booking-reviews/src/components/kanban/types.ts (v1).
// propertyId/propertyLabel → uhId/uhNumero; PropertyOption → UHOption (a UI
// continua chamando de "propriedade" no texto visível — é o termo que a
// Booking/Airbnb usam — mas o dado por trás é a UH cadastrada no gateway,
// não um cadastro próprio deste app). `reworkRequests` removido: o model
// ReworkRequest do v1 já estava marcado como legado (substituído por
// reopenAnalysisAction) e a UI do CardDetailDrawer nunca chegou a usá-lo.

export type KanbanReview = {
  id: string;
  guestName: string;
  platform: string;
  comment: string | null;
  ratingNormalized: number;
  ratingRaw: number;
  ratingScaleMax: number;
  guestSubmittedAt: string;
  uhId: string;
  uhNumero: string | null;
  checkInDate: string | null;
  stage: string;
  skippedToFinal: boolean;
  analysisDueAt: string | null;
  attendants: { attendantId: string; name: string; score: number; observation: string }[];
  categoryIds: string[];
  actionItems: {
    id: string;
    description: string;
    dueDate: string;
    completedAt: string | null;
    completedByName: string | null;
  }[];
  efficacyChecks: {
    id: string;
    scheduledDate: string;
    description: string | null;
    completedAt: string | null;
    wasEffective: boolean | null;
    notes: string | null;
  }[];
  managerialNotes: {
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    createdAt: string;
  }[];
  attachments: {
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number | null;
    contentType: string | null;
    uploadedById: string;
    uploadedByName: string;
    createdAt: string;
  }[];
  logs: {
    id: string;
    action: string;
    detail: string | null;
    actorName: string;
    createdAt: string;
  }[];
};

export type Attendant = { id: string; name: string };
export type CategoryOption = { id: string; name: string };
export type UHOption = { id: string; numero: string };

export type PendingAirbnbImportItem = {
  id: string;
  guestName: string;
  ratingRaw: number;
  guestSubmittedAt: string;
  checkInDate: string | null;
};

export const STAGES: { key: string; label: string }[] = [
  { key: "RECEBIDA", label: "Avaliação Recebida" },
  { key: "ANALISE_PLANEJAMENTO", label: "Análise & Planejamento" },
  { key: "EXECUCAO", label: "Execução" },
  { key: "AVALIACAO_EFICACIA", label: "Avaliação da Eficácia" },
  { key: "FINALIZADA", label: "Finalizadas" },
];
