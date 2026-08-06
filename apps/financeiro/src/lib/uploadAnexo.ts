import { apiFetch } from "./apiFetch";

// Upload de anexo (comprovante/nota fiscal) DIRETO do navegador pro
// Cloudinary — pedido do Felipe, 06/08/2026, card "Novo lançamento" da
// tela de Conciliações. Mesmo padrão de apps/maintenance
// (uploadFoto.ts)/apps/housekeeping: o servidor só assina a requisição
// (/api/upload-signature, corpo pequeno) e devolve os dados pro cliente
// subir o arquivo direto pra api.cloudinary.com — evita o limite fixo de
// 4.5MB do corpo de Serverless Functions da Vercel. Usa o endpoint "auto"
// (não "image") porque anexo financeiro é tipicamente PDF/nota fiscal, não
// só foto.
export type AnexoUpload = { url: string; fileName: string; fileSize: number };

export async function uploadAnexo(file: File): Promise<AnexoUpload> {
  const sigRes = await apiFetch("/api/upload-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nomeOriginal: file.name }),
  });
  if (!sigRes.ok) {
    let msg = `Falha ao preparar upload (HTTP ${sigRes.status}).`;
    try {
      const errBody = await sigRes.json();
      if (errBody?.error) msg = errBody.error;
    } catch {
      // resposta não era JSON — mantém a mensagem com o status.
    }
    throw new Error(msg);
  }
  const { cloudName, apiKey, timestamp, signature, folder, publicId } = await sigRes.json();

  const cldForm = new FormData();
  cldForm.append("file", file);
  cldForm.append("api_key", apiKey);
  cldForm.append("timestamp", String(timestamp));
  cldForm.append("signature", signature);
  cldForm.append("folder", folder);
  cldForm.append("public_id", publicId);

  // "auto" detecta imagem/PDF/documento sozinho.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: cldForm,
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Falha no upload (Cloudinary ${res.status}).`);
  }

  return { url: data.secure_url as string, fileName: file.name, fileSize: (data.bytes as number) ?? file.size };
}
