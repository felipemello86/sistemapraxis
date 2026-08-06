import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess } from "@praxis/core";
import crypto from "crypto";

// Assina a requisição de upload pro Cloudinary — o cliente usa essa
// assinatura pra mandar o arquivo DIRETO pro Cloudinary
// (api.cloudinary.com), sem passar pelo nosso servidor (mesmo padrão de
// apps/maintenance e apps/housekeeping — evita o limite fixo de 4.5MB do
// corpo de Serverless Functions da Vercel). Pedido do Felipe, 06/08/2026:
// anexo (comprovante/nota fiscal) no card "Novo lançamento" da tela de
// Conciliações.
//
// Corpo desta requisição é só JSON pequeno (nome do arquivo) — nunca o
// arquivo em si — então não tem limite de tamanho relevante aqui.

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
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    return NextResponse.json(
      { error: "Cloudinary não configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET." },
      { status: 500 }
    );
  }

  const { nomeOriginal } = await req.json().catch(() => ({ nomeOriginal: "" }));
  const ext = typeof nomeOriginal === "string" && nomeOriginal.includes(".") ? "." + nomeOriginal.split(".").pop() : "";

  const folder = `financeiro/${session.tenantSlug || session.tenantId}/conciliacoes`;
  const publicId = `anexo_${Date.now()}${ext}`;
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
