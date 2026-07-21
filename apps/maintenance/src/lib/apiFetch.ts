// Wrapper de fetch pra chamadas client-side às rotas /api/* deste app.
//
// O Next.js só prefixa automaticamente com o basePath as navegações via
// next/link, next/router e o carregamento de assets — chamadas cruas de
// fetch("/api/...") feitas no cliente NÃO são prefixadas. Como este app
// vive em "/upkeep" (ver next.config.js), sem esse wrapper todo fetch pro
// backend próprio quebraria em produção. Mesmo padrão de
// apps/housekeeping/src/lib/apiFetch.ts e apps/booking-reviews (idem).
//
// Uso: trocar fetch("/api/upload", ...) por apiFetch("/api/upload", ...).
// Path passado deve sempre começar com "/".

const BASE_PATH = "/upkeep";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("/") ? `${BASE_PATH}${path}` : path;
  return fetch(url, init);
}
