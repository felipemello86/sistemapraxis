import { apiFetch } from "./apiFetch";

export type UploadResult = { url: string; fileSize: number };

/**
 * Upload de foto DIRETO do navegador pro Cloudinary — o binário nunca passa
 * pelo nosso servidor. Corrige o bug de "não consigo anexar foto" (foto
 * tirada na hora pela câmera, 3-8MB, sempre falhava): o servidor só assina
 * a requisição (/api/upload-signature, corpo pequeno) e devolve os dados
 * pro cliente subir o arquivo direto pra api.cloudinary.com — evitando o
 * limite fixo de 4.5MB do corpo de Serverless Functions da Vercel, que o
 * antigo padrão (arquivo passando pelo /api/upload) estourava.
 *
 * Usado pelos 8 pontos de upload de foto do app (Inspeção, UH 3D,
 * Informações do item, e os 3 kanbans de Correção) — antes cada um tinha
 * sua própria cópia do fetch pro extinto /api/upload.
 */
export async function uploadFoto(file: File, pasta: string, tipo: string): Promise<UploadResult> {
  const sigRes = await apiFetch("/api/upload-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pasta, tipo }),
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

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: cldForm,
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Falha no upload (Cloudinary ${res.status}).`);
  }

  return { url: data.secure_url as string, fileSize: (data.bytes as number) ?? file.size };
}
