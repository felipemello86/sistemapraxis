/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mesmo padrão dos outros módulos: basePath fixo batendo o slug do
  // módulo (ver addressing.ts em @praxis/core — BOOKING_REVIEWS = "reviews").
  // O gateway faz rewrite de /:cliente/reviews/* pra cá (ver
  // apps/gateway/next.config.js, regra REVIEWS_APP_URL já preparada).
  basePath: "/reviews",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

module.exports = nextConfig;
