// Wrapper de fetch pra chamadas client-side às rotas /api/* deste app.
// Mesmo padrão do estoque (ver apps/estoque/src/lib/apiFetch.ts) — o
// Next.js não prefixa fetch("/api/...") feito no cliente com o basePath
// ("/restaurante") automaticamente, só navegação via next/link.

const BASE_PATH = "/restaurante";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("/") ? `${BASE_PATH}${path}` : path;
  return fetch(url, init);
}
