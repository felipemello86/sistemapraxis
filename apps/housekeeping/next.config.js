/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mesmo padrão da v1: cada módulo mora no seu próprio deploy Vercel, com
  // basePath fixo batendo o slug do módulo (ver addressing.ts em
  // @praxis/core — HOUSEKEEPING = "governance"). O gateway faz rewrite de
  // /:cliente/governance/* pra cá (ver apps/gateway/next.config.js).
  basePath: "/governance",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

module.exports = nextConfig;
