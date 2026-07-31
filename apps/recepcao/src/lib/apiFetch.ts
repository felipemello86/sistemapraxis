// Wrapper de fetch pra chamadas client-side às rotas /api/* deste app.
// Mesmo padrão dos outros módulos (ver apps/restaurante/src/lib/apiFetch.ts)
// — o Next.js não prefixa fetch("/api/...") feito no cliente com o
// basePath ("/recepcao") automaticamente, só navegação via next/link.

const BASE_PATH = "/recepcao";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("/") ? `${BASE_PATH}${path}` : path;
  return fetch(url, init);
}
