import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Portado de apps/maintenance/src/lib/utils.ts (v1) verbatim — usado pelos
// componentes de UI (Base UI/shadcn-style) portados junto, ver comentário em
// components/ui-kit.tsx.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
