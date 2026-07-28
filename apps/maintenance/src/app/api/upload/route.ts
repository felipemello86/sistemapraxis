import { NextResponse } from "next/server";

// DESATIVADA — substituída por /api/upload-signature (ver
// apps/maintenance/src/lib/uploadFoto.ts). Esta rota recebia o binário da
// foto no corpo da requisição e repassava pro Cloudinary a partir do
// servidor, o que batia no limite fixo de 4.5MB do corpo de Serverless
// Functions da Vercel — fotos tiradas na hora pela câmera do celular
// (rotineiramente 3-8MB) falhavam sempre ("não consigo anexar foto").
// O novo fluxo faz o upload direto do navegador pro Cloudinary; o servidor
// só assina a requisição. Nenhum client deste app aponta mais pra cá — o
// arquivo foi mantido (em vez de removido) só porque o ambiente não permite
// apagar arquivos; retorna 410 pra falhar alto e claro caso algo
// desatualizado (ex.: build antigo do app nativo em cache) ainda tente usar.
export async function POST() {
  return NextResponse.json(
    { error: "Rota desativada. Use /api/upload-signature (upload direto pro Cloudinary)." },
    { status: 410 },
  );
}
