// Portado de apps/booking-reviews/src/lib/safeAction.ts (v1) verbatim — ver
// comentário lá para a explicação completa (Next.js apaga mensagens de erro
// que atravessam a fronteira de uma Server Action em produção).
export type SafeActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

export function safeAction<Args extends unknown[], T>(fn: (...args: Args) => Promise<T>) {
  return async (...args: Args): Promise<SafeActionResult<T>> => {
    try {
      const data = await fn(...args);
      return { ok: true, data };
    } catch (e) {
      console.error(e);
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Ocorreu um erro inesperado.",
      };
    }
  };
}

export function unwrapSafeAction<T>(result: SafeActionResult<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

export function rejectIfSafeActionFailed(result: unknown): void {
  if (
    result &&
    typeof result === "object" &&
    "ok" in result &&
    (result as { ok: unknown }).ok === false &&
    "message" in result
  ) {
    throw new Error(String((result as { message: unknown }).message));
  }
}
