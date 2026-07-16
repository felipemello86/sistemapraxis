/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sem basePath por enquanto — rodando standalone (porta 3101) enquanto o
  // módulo é portado e testado local. O basePath ("/governance") e o rewrite
  // no gateway entram junto com o deploy real na Vercel (ver v1
  // apps/housekeeping/next.config.js e apps/gateway/next.config.js como
  // referência do padrão a seguir).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

module.exports = nextConfig;
