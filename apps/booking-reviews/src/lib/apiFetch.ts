// Wrapper de fetch pra chamadas client-side às rotas /api/* deste app.
// Mesmo padrão de apps/housekeeping/src/lib/apiFetch.ts — necessário porque
// este app vive em "/reviews" (ver next.config.js) e fetch("/api/...") cru
// no cliente não é prefixado automaticamente pelo Next.
//
// Uso: trocar fetch("/api/reviews", ...) por apiFetch("/api/reviews", ...).
// Path passado deve sempre começar com "/".

const BASE_PATH = "/reviews";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("/") ? `${BASE_PATH}${path}` : path;
  return fetch(url, init);
}
