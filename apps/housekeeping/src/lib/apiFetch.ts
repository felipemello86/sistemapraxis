// Wrapper de fetch pra chamadas client-side às rotas /api/* deste app.
//
// O Next.js só prefixa automaticamente com o basePath as navegações via
// next/link, next/router e o carregamento de assets — chamadas cruas de
// fetch("/api/...") feitas no cliente NÃO são prefixadas. Como este app
// vive em "/governance" (ver next.config.js), sem esse wrapper todo fetch
// pro backend próprio quebraria em produção (a v1 teve o mesmo problema,
// resolvido com o mesmo padrão em lib/publicApiFetch.ts).
//
// Uso: trocar fetch("/api/sessoes", ...) por apiFetch("/api/sessoes", ...).
// Path passado deve sempre começar com "/".

const BASE_PATH = "/governance";

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("/") ? `${BASE_PATH}${path}` : path;
  return fetch(url, init);
}
