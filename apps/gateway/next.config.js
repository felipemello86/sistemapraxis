/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cada módulo de negócio vive no seu próprio deploy Vercel, com basePath
  // fixo (ver @praxis/core/addressing.ts). O gateway só faz proxy: as URLs
  // públicas continuam tenant-scoped (/bnbflex/governance), diferente da v1
  // que não tinha prefixo de cliente — por isso aqui a rota de origem leva
  // :cliente mas o destino ignora esse segmento (o módulo descobre o tenant
  // pela sessão, não pela URL).
  async rewrites() {
    const rules = [];

    if (process.env.GOVERNANCE_APP_URL) {
      rules.push(
        { source: "/:cliente/governance", destination: `${process.env.GOVERNANCE_APP_URL}/governance` },
        { source: "/:cliente/governance/:path*", destination: `${process.env.GOVERNANCE_APP_URL}/governance/:path*` }
      );
    }

    if (process.env.UPKEEP_APP_URL) {
      rules.push(
        { source: "/:cliente/upkeep", destination: `${process.env.UPKEEP_APP_URL}/upkeep` },
        { source: "/:cliente/upkeep/:path*", destination: `${process.env.UPKEEP_APP_URL}/upkeep/:path*` }
      );
    }

    if (process.env.REVIEWS_APP_URL) {
      rules.push(
        { source: "/:cliente/reviews", destination: `${process.env.REVIEWS_APP_URL}/reviews` },
        { source: "/:cliente/reviews/:path*", destination: `${process.env.REVIEWS_APP_URL}/reviews/:path*` }
      );
    }

    return rules;
  },
};

module.exports = nextConfig;
