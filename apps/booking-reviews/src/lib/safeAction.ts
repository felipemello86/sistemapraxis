// Portado de apps/booking-reviews/src/lib/safeAction.ts (v1) verbatim.
//
// Em produção, o Next.js apaga a mensagem de qualquer erro lançado (throw)
// que atravesse a fronteira de uma Server Action — o cliente recebe só um
// "digest" genérico e sem sentido, mesmo para erros de validação lançados de
// propósito (ex: "Selecione a propriedade."). É comportamento intencional do
// Next.js (não dá pra desativar) — a solução recomendada é nunca deixar o
// erro atravessar a fronteira via throw: a própria action captura e devolve
// como um valor normal, e só então o código do cliente decide mostrar a
// mensagem.
//
// `safeAction` embrulha a lógica real de uma action (que continua podendo
// usar `throw new Error("mensagem")` normalmente) e devolve sempre um
// `SafeActionResult` em vez de lançar. `unwrapSafeAction`, do lado do
// cliente, desfaz esse embrulho — se deu erro, relança normalmente (isso
// acontece só no navegador, então a mensagem chega intacta no catch de quem
// chamou).
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

// Versão "solta" pro caso em que só importa garantir que, se a action
// falhou, o erro seja lançado — sem se importar com o tipo do valor de
// sucesso. Usada pelo `run()` genérico dos componentes, que já ignora o
// valor de retorno em caso de sucesso.
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
