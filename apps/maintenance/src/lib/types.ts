// Tipos "view model" desta tela — moldados na page.tsx (server) a partir do
// schema real (@praxis/core: UH, MaintenanceChecklistItem, MaintenanceInspection,
// MaintenanceInspectionItem, User), não importados direto do Prisma. Mesmo
// padrão já usado em apps/booking-reviews/src/components/reunioes/types.ts.
//
// Os nomes de campo aqui (unit.name, inspector.name, item.id no lugar do
// itemLegacyId da v1) foram escolhidos pra bater com o que os componentes de
// view (portados quase verbatim da v1) já esperam — assim quase nenhuma view
// precisou mudar, só a "camada de adaptação" na page.tsx que popula estes
// tipos a partir do UH.numero / User.nome reais.

export type UnitOption = { id: string; name: string };

export type ChecklistItem = {
  id: string;
  name: string;
  category: string;
  subDescription: string | null;
};

export type InspectionItem = {
  id: string;
  checklistItemId: string | null;
  status: "CONFORME" | "NAO_CONFORME";
  comment: string | null;
  photos: string[];
  corrigidoEm: string | null; // ISO — preenchido quando uma MaintenanceCorrection resolve o item
};

export type InspecaoComUnidade = {
  id: string;
  date: string; // ISO
  unitId: string;
  unit: UnitOption;
  inspectorId: string | null;
  inspector: { id: string; name: string } | null;
  items: InspectionItem[];
};

export type DashboardUser = {
  name: string;
  email: string;
  role?: string;
  tenantSlug?: string;
};

export type ViewId =
  | "gerencial"
  | "evolucao"
  | "informacoes"
  | "correcao"
  | "performance"
  | "uh3d"
  | "config";

// Cômodos padrão da tela imersiva "UH 3D" — "porta" é sempre a imagem de
// entrada (primeira exibida ao selecionar a UH). Texto livre no banco (ver
// comentário em MaintenanceUhImage no schema), esta lista é só a UI.
export const ROOM_TYPES = ["porta", "quarto", "cozinha", "banheiro"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  porta: "Porta",
  quarto: "Quarto",
  cozinha: "Cozinha",
  banheiro: "Banheiro",
};

// Um cômodo pode ter mais de uma foto — a ordem de exibição na tela
// imersiva e no cadastro é sempre createdAt asc (sem campo de ordem
// dedicado, ver comentário em MaintenanceUhImage no schema Prisma).
export type UhImage = {
  id: string;
  uhId: string;
  tipo: string;
  imageUrl: string;
  createdAt: string; // ISO
};

// Um item de checklist posicionado sobre uma UhImage — x/y em % (0-100),
// relativo à imagem, pra ficar responsivo em qualquer tamanho de tela.
export type UhSpot = {
  id: string;
  imageId: string;
  checklistItemId: string;
  x: number;
  y: number;
};

// "Informações do item" (IV-UH) — dado cadastral livre por UH x item de
// checklist (ex.: ar-condicionado → potência, fabricante, serial). Ver
// comentário em MaintenanceItemInfo no schema Prisma.
export type ItemInfo = {
  id: string;
  uhId: string;
  checklistItemId: string;
  info: string | null;
  photos: string[];
  updatedAt: string; // ISO
  updatedByName: string | null;
};

export type ItemInfoLogEntry = {
  id: string;
  uhId: string;
  checklistItemId: string;
  previousInfo: string | null;
  newInfo: string | null;
  previousPhotos: string[];
  newPhotos: string[];
  authorName: string | null;
  createdAt: string; // ISO
};

// UH.id -> lista de ChecklistItem.id atribuídos a essa unidade. Ausência de
// chave (ou array vazio) significa "todos os itens do catálogo se aplicam"
// — ver comentário em MaintenanceUnitChecklistItem no schema Prisma.
export type AtribuicoesPorUnidade = Record<string, string[]>;

export type MaintenanceConfigView = {
  maxDaysBetweenInspections: number;
  goal: number;
};

export type CorrectionSummary = {
  id: string;
  uhId: string;
  uhName: string;
  checklistItemId: string | null;
  checklistItemName: string | null;
  description: string;
  photos: string[];
  createdAt: string; // ISO
  authorName: string | null;
};

/* --------------------------- Fluxo de Correção ---------------------------- */
// Tela "Correção" (Aquisição / Serviços Externos / Execução) — ver
// comentário completo em MaintenanceCorrectionCard no schema Prisma e em
// packages/core/src/maintenanceCorrection.ts (kanbansDoCard,
// podeAgendarServico).

export type SupplierView = {
  id: string;
  nome: string;
  contato: string | null;
  observacao: string | null;
  checklistItemIds: string[]; // pra sugerir "fornecedores já usados nesse tipo de item"
};

export type SchedulingLogView = {
  id: string;
  previousSupplierNome: string | null;
  previousDate: string | null; // ISO
  newSupplierNome: string | null;
  newDate: string | null; // ISO
  authorName: string | null;
  createdAt: string; // ISO
};

export type CorrectionCardView = {
  id: string;
  uhId: string;
  uhName: string;
  checklistItemId: string | null;
  checklistItemName: string | null;
  checklistItemCategory: string | null;
  comment: string | null; // descrição atual da não conformidade (do InspectionItem)
  photos: string[]; // fotos atuais da não conformidade
  createdAt: string; // ISO — quando o card nasceu

  needsMaterial: boolean; // sempre não-nulo aqui — cards não triados são filtrados na query
  needsExternalService: boolean;

  materialStatus: "A_ADQUIRIR" | "COMPRADO";
  materialReceiptPhoto: string | null;
  materialCompradoEm: string | null; // ISO

  externalServiceStatus: "A_CONTRATAR" | "EM_NEGOCIACAO" | "AGENDADO" | "EXECUTADO";
  hiredSupplierId: string | null;
  hiredSupplierNome: string | null;
  scheduledDate: string | null; // ISO
  quotes: { id: string; supplierId: string; supplierNome: string; createdAt: string }[];
  schedulingLogs: SchedulingLogView[];

  executionStatus: "A_FAZER" | "PLANEJADA" | "EXECUTADA";
  dailyCommitmentId: string | null;
  blockForReservation: boolean | null;

  executedDescription: string | null;
  executedPhotos: string[];
  executedAt: string | null; // ISO
  executedByName: string | null;
};

export type DailyCommitmentView = {
  id: string;
  data: string; // "YYYY-MM-DD"
  closedAt: string; // ISO
  closedByName: string | null;
  conformidadeAntes: number | null;
  conformidadeDepois: number | null;
  reportSentAt: string | null; // ISO
  cards: {
    id: string;
    uhName: string;
    checklistItemName: string | null;
    executionStatus: "A_FAZER" | "PLANEJADA" | "EXECUTADA";
    executedAt: string | null; // ISO
  }[];
  // Não conformidades (IV) identificadas nesse dia (createdAt do card de
  // Correção cai nesse dia, fuso America/Sao_Paulo) que ainda não foram
  // resolvidas — nada a ver com o compromisso diário do Kanban de Execução
  // acima (pode ser card de qualquer um dos 3 kanbans, ou nenhum ainda
  // fechado). Calculado "ao vivo" (estado atual), não é um retrato
  // congelado do fim daquele dia — mesmo critério já usado por "cards"
  // acima (executionStatus também reflete o estado atual).
  naoConformidadesIdentificadas: {
    id: string;
    uhName: string;
    checklistItemName: string | null;
    comment: string | null;
    createdAt: string; // ISO
  }[];
};
