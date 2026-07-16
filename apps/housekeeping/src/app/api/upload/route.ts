import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@praxis/core";
import crypto from "crypto";

// Portado de apps/housekeeping/src/app/api/upload/route.ts (v1) — upload
// assinado direto pro Cloudinary (sem passar o binário pelo nosso servidor).
// A checagem de storage em background (verificarELimparStorage) não foi
// portada ainda; fica pra quando o volume de uso justificar.

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

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sessaoId = formData.get("sessaoId") as string | null;
    const pasta = formData.get("pasta") as string | null;
    const tipo = (formData.get("tipo") as string) || "foto";

    if (!file) {
      return NextResponse.json({ error: "file obrigatório" }, { status: 400 });
    }

    const folder = sessaoId
      ? `governanca/sessoes/${sessaoId}`
      : pasta
      ? `governanca/${pasta}`
      : "governanca/perfis";
    const public_id = `${tipo}_${Date.now()}`;
    const timestamp = String(Math.round(Date.now() / 1000));

    const signature = assinarRequisicao({ folder, public_id, timestamp });

    const cldForm = new FormData();
    cldForm.append("file", file);
    cldForm.append("api_key", API_KEY);
    cldForm.append("timestamp", timestamp);
    cldForm.append("signature", signature);
    cldForm.append("folder", folder);
    cldForm.append("public_id", public_id);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: cldForm,
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error?.message || `Cloudinary error ${res.status}`);
    }

    return NextResponse.json({ url: data.secure_url, filename: data.public_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
