import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@praxis/core";
import crypto from "crypto";

// Assina a requisição de upload pro Cloudinary — o cliente usa essa
// assinatura pra mandar o arquivo DIRETO pro Cloudinary
// (api.cloudinary.com), sem passar pelo nosso servidor. Substitui o antigo
// /api/upload (desativado, ver route.ts dessa pasta irmã), que recebia o
// binário inteiro no corpo da requisição e batia no limite FIXO de 4.5MB do
// corpo de Serverless Functions da Vercel — mesmo bug já corrigido em
// apps/maintenance (ver histórico: fotos tiradas na hora pela câmera do
// celular falhavam sistematicamente). Ver
// apps/housekeeping/src/lib/uploadFoto.ts pro lado cliente.
//
// Corpo desta requisição é só JSON pequeno (pasta/tipo/sessaoId/etc) —
// nunca o arquivo em si — então não tem limite de tamanho relevante aqui.
//
// Mesmo padrão de assinatura (SHA-256 manual, sem SDK) do antigo
// /api/upload — só mudou o que cada lado faz: aqui só assina, o cliente
// quem sobe o arquivo.

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function assinarRequisicao(params: Record<string, string>): string {
  const str = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha256").update(str + API_SECRET).digest("hex");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    return NextResponse.json(
      { error: "Cloudinary não configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET." },
      { status: 500 },
    );
  }

  const { sessaoId, pasta, tipo, resourceType, fileName } = await req.json();

  // Mesmo critério de pasta e "resourceType" (image vs auto, pra anexo de
  // queixa que pode ser PDF) do antigo /api/upload.
  const resType = (resourceType as string) || "image";
  const folder = sessaoId
    ? `governanca/sessoes/${sessaoId}`
    : pasta
    ? `governanca/${pasta}`
    : "governanca/perfis";
  const ext = resType === "auto" && fileName && fileName.includes(".") ? "." + fileName.split(".").pop() : "";
  const publicId = `${tipo || "foto"}_${Date.now()}${ext}`;
  const timestamp = Math.round(Date.now() / 1000);

  const signature = assinarRequisicao({ folder, public_id: publicId, timestamp: String(timestamp) });

  return NextResponse.json({
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
    timestamp,
    signature,
    folder,
    publicId,
    resourceType: resType,
  });
}
