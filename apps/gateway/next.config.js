/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sem rewrites pra outros apps ainda — esta fase é só a fundação
  // (login, hub, usuários). Quando os módulos de negócio forem portados
  // pra este monorepo, os rewrites entram aqui seguindo o mesmo padrão da
  // v1 (ver ../../../apps/gateway/next.config.js como referência).
};

module.exports = nextConfig;
