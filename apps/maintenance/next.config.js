/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mesmo padrão dos outros módulos: basePath fixo batendo o slug do
  // módulo (ver addressing.ts em @praxis/core — MAINTENANCE = "upkeep").
  // O gateway já tem a regra de rewrite pra cá preparada (UPKEEP_APP_URL em
  // apps/gateway/next.config.js, de uma tentativa anterior de migração).
  basePath: "/upkeep",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

module.exports = nextConfig;
