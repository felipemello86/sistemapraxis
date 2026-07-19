/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cada módulo de negócio vive no seu próprio deploy Vercel, com basePath
  // fixo (ver @praxis/core/addressing.ts). O gateway só faz proxy: as URLs
  // públicas continuam tenant-scoped (/bnbflex/governance), diferente da v1
  // que não tinha prefixo de cliente — por isso aqui a rota de origem leva
  // :cliente mas o destino ignora esse segmento (o módulo descobre o tenant
  // pela sessão, não pela URL).
  //
  // IMPORTANTE: o Next.js de cada módulo gera sozinho (a partir do seu
  // basePath fixo) os caminhos de CSS/JS (/governance/_next/...) e as
  // chamadas de API do apiFetch (/governance/api/...) SEM o slug do
  // tenant — ele não sabe que existe um prefixo /:cliente na URL pública.
  // Por isso, além da regra tenant-scoped (pra navegação de página),
  // é preciso uma regra "bare" (sem :cliente) pra cada módulo, senão
  // esses assets e chamadas de API caem em 404 quando acessados através
  // do gateway (o que quebra estilo, JS e dados — não é cache).
  async rewrites() {
    const rules = [];

    if (process.env.GOVERNANCE_APP_URL) {
      rules.push(
        { source: "/:cliente/governance", destination: `${process.env.GOVERNANCE_APP_URL}/governance` },
        { source: "/:cliente/governance/:path*", destination: `${process.env.GOVERNANCE_APP_URL}/governance/:path*` },
        { source: "/governance", destination: `${process.env.GOVERNANCE_APP_URL}/governance` },
        { source: "/governance/:path*", destination: `${process.env.GOVERNANCE_APP_URL}/governance/:path*` }
      );
    }

    if (process.env.UPKEEP_APP_URL) {
      rules.push(
        { source: "/:cliente/upkeep", destination: `${process.env.UPKEEP_APP_URL}/upkeep` },
        { source: "/:cliente/upkeep/:path*", destination: `${process.env.UPKEEP_APP_URL}/upkeep/:path*` },
        { source: "/upkeep", destination: `${process.env.UPKEEP_APP_URL}/upkeep` },
        { source: "/upkeep/:path*", destination: `${process.env.UPKEEP_APP_URL}/upkeep/:path*` }
      );
    }

    if (process.env.REVIEWS_APP_URL) {
      rules.push(
        { source: "/:cliente/reviews", destination: `${process.env.REVIEWS_APP_URL}/reviews` },
        { source: "/:cliente/reviews/:path*", destination: `${process.env.REVIEWS_APP_URL}/reviews/:path*` },
        { source: "/reviews", destination: `${process.env.REVIEWS_APP_URL}/reviews` },
        { source: "/reviews/:path*", destination: `${process.env.REVIEWS_APP_URL}/reviews/:path*` }
      );
    }

    if (process.env.ESTOQUE_APP_URL) {
      rules.push(
        { source: "/:cliente/estoque", destination: `${process.env.ESTOQUE_APP_URL}/estoque` },
        { source: "/:cliente/estoque/:path*", destination: `${process.env.ESTOQUE_APP_URL}/estoque/:path*` },
        { source: "/estoque", destination: `${process.env.ESTOQUE_APP_URL}/estoque` },
        { source: "/estoque/:path*", destination: `${process.env.ESTOQUE_APP_URL}/estoque/:path*` }
      );
    }

    if (process.env.RESTAURANTE_APP_URL) {
      rules.push(
        { source: "/:cliente/restaurante", destination: `${process.env.RESTAURANTE_APP_URL}/restaurante` },
        { source: "/:cliente/restaurante/:path*", destination: `${process.env.RESTAURANTE_APP_URL}/restaurante/:path*` },
        { source: "/restaurante", destination: `${process.env.RESTAURANTE_APP_URL}/restaurante` },
        { source: "/restaurante/:path*", destination: `${process.env.RESTAURANTE_APP_URL}/restaurante/:path*` }
      );
    }

    return rules;
  },
};

module.exports = nextConfig;
