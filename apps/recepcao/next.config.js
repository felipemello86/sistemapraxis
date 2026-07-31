/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mesmo padrão dos outros módulos: deploy Vercel próprio, basePath fixo
  // batendo o slug do módulo (ver addressing.ts em @praxis/core —
  // RECEPTION = "recepcao"). O gateway faz rewrite de /:cliente/recepcao/*
  // pra cá.
  basePath: "/recepcao",
};

module.exports = nextConfig;
