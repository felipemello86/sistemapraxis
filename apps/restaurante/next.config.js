/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mesmo padrão dos outros módulos: deploy Vercel próprio, basePath fixo
  // batendo o slug do módulo (ver addressing.ts em @praxis/core —
  // RESTAURANT = "restaurante"). O gateway faz rewrite de
  // /:cliente/restaurante/* pra cá.
  basePath: "/restaurante",
};

module.exports = nextConfig;
