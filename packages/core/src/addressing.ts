import type { SuiteModule } from "../generated";

// Slug de URL <-> enum do banco. Único lugar onde essa tradução existe —
// qualquer app que precise disso importa daqui, nunca reimplementa.
export const MODULE_SLUGS: Record<SuiteModule, string> = {
  HOUSEKEEPING: "governance",
  MAINTENANCE: "upkeep",
  BOOKING_REVIEWS: "reviews",
  STOCK: "estoque",
  RESTAURANT: "restaurante",
};

export const MODULE_LABELS: Record<SuiteModule, string> = {
  HOUSEKEEPING: "Governança",
  MAINTENANCE: "Manutenção",
  BOOKING_REVIEWS: "Avaliações",
  STOCK: "Estoque",
  RESTAURANT: "Restaurante",
};

const SLUG_TO_MODULE: Record<string, SuiteModule> = Object.fromEntries(
  Object.entries(MODULE_SLUGS).map(([module, slug]) => [slug, module as SuiteModule])
);

export function moduleSlugToModule(slug: string): SuiteModule | null {
  return SLUG_TO_MODULE[slug] ?? null;
}

export function moduleToSlug(module: SuiteModule): string {
  return MODULE_SLUGS[module];
}
