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
  | "controle"
  | "rota"
  | "correcao"
  | "config";

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
