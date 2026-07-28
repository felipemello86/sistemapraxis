import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@praxis/core";
import crypto from "crypto";

// Assina a requisição de upload pro Cloudinary — o cliente usa essa
// assinatura pra mandar o arquivo DIRETO pro Cloudinary
// (api.cloudinary.com), sem passar pelo nosso servidor. Substitui o antigo
// /api/upload (removido), que recebia o binário inteiro no corpo da
// requisição e batia no limite FIXO de 4.5MB do corpo de Serverless
// Functions da Vercel (não configurável, mesmo em runtime "nodejs") — fotos
// tiradas na hora pela câmera do celular (rotineiramente 3-8MB) falhavam
// sempre, apesar do app liberar até 8MB no cliente (ver
// apps/maintenance/src/lib/uploadFoto.ts, usado pelos 8 pontos de upload de
// foto do app: Inspeção, UH 3D, Informações do item, e os 3 kanbans de
// Correção).
//
// Corpo desta requisição é só JSON pequeno (pasta/tipo) — nunca o arquivo
// em si — então não tem limite de tamanho relevante aqui.
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

  const { pasta, tipo } = await req.json();
  const folder = `manutencao/${session.tenantSlug || session.tenantId}/${pasta || "geral"}`;
  const publicId = `${tipo || "foto"}_${Date.now()}`;
  const timestamp = Math.round(Date.now() / 1000);

  const signature = assinarRequisicao({ folder, public_id: publicId, timestamp: String(timestamp) });

  return NextResponse.json({
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
    timestamp,
    signature,
    folder,
    publicId,
  });
}
