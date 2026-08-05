/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mesmo padrão dos outros módulos: deploy Vercel próprio, basePath fixo
  // batendo o slug do módulo (ver @praxis/core/addressing.ts — FINANCE =
  // "financeiro"). O gateway faz rewrite de /:cliente/financeiro/* pra cá.
  basePath: "/financeiro",
};

module.exports = nextConfig;
