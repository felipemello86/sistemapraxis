/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mesmo padrão dos outros módulos: deploy Vercel próprio, basePath fixo
  // batendo o slug do módulo (ver addressing.ts em @praxis/core — STOCK =
  // "estoque"). O gateway faz rewrite de /:cliente/estoque/* pra cá.
  basePath: "/estoque",
};

module.exports = nextConfig;
