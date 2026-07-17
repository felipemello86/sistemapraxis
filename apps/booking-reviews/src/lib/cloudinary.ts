/**
 * Upload/delete de anexos no Cloudinary — mesmo padrão usado em
 * apps/housekeeping (src/lib/cloudinary-storage.ts), portado de
 * apps/booking-reviews/src/lib/cloudinary.ts (v1) verbatim (não tinha
 * nenhuma referência a Company/tenant — o folder já vem parametrizado por
 * quem chama).
 *
 * Não guardamos public_id/resource_type em campos separados no banco —
 * eles são extraídos de volta a partir da própria fileUrl na hora de
 * deletar (ver parseCloudinaryUrl), pra não precisar de migração de schema.
 */
import crypto from "crypto";

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

export async function uploadToCloudinary(
  file: File,
  folder: string
): Promise<{ url: string; fileSize: number }> {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error(
      "Cloudinary não configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no Vercel."
    );
  }

  // Extensão original preservada no public_id (senão anexos tipo PDF/doc
  // baixam sem extensão) — sem usar o nome original inteiro (pode ter
  // espaços/acentos/pontos extras que atrapalham o parse na hora de deletar).
  const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
  const public_id = `anexo_${Date.now()}${ext}`;
  const timestamp = String(Math.round(Date.now() / 1000));
  const signature = assinarRequisicao({ folder, public_id, timestamp });

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", API_KEY);
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("folder", folder);
  form.append("public_id", public_id);

  // "auto" detecta imagem/vídeo/documento sozinho — os outros endpoints
  // (image/upload, raw/upload) exigiriam saber o tipo antes de mandar.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Cloudinary error ${res.status}`);
  }

  return { url: data.secure_url as string, fileSize: data.bytes as number };
}

function parseCloudinaryUrl(url: string): { resourceType: string; publicId: string } | null {
  // Formato: https://res.cloudinary.com/<cloud>/<resource_type>/upload/v<versao>/<public_id>.<ext>
  const m = url.match(/\/([a-z]+)\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  if (!m) return null;
  return { resourceType: m[1], publicId: m[2] };
}

export async function deleteFromCloudinary(url: string): Promise<void> {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) return;
  const parsed = parseCloudinaryUrl(url);
  if (!parsed) return;

  const timestamp = String(Math.round(Date.now() / 1000));
  const signature = assinarRequisicao({ public_id: parsed.publicId, timestamp });

  const form = new URLSearchParams();
  form.set("public_id", parsed.publicId);
  form.set("api_key", API_KEY);
  form.set("timestamp", timestamp);
  form.set("signature", signature);

  await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${parsed.resourceType}/destroy`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }).catch(() => {});
}
