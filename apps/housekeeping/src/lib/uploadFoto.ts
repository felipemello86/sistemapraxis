import { apiFetch } from "./apiFetch";

export type UploadResult = { url: string; filename: string; fileSize: number; originalName: string };

/**
 * Upload de foto/anexo DIRETO do navegador pro Cloudinary — o binário nunca
 * passa pelo nosso servidor. Corrige o bug de lentidão/falha ao anexar foto
 * (câmera do celular, 3-8MB, esbarrava no limite fixo de 4.5MB do corpo de
 * Serverless Functions da Vercel, o mesmo já corrigido em apps/maintenance):
 * o servidor só assina a requisição (/api/upload-signature, corpo pequeno)
 * e devolve os dados pro cliente subir o arquivo direto pra
 * api.cloudinary.com.
 *
 * Usado pelos 7 pontos de upload do app (Camareira: super limpeza,
 * manutenção, fotos da sessão, edição de fotos, lavanderia; Governanta:
 * manutenção; Seleção: anexo de queixa; Falhas Gerenciais: resolução) —
 * antes cada um tinha sua própria cópia do fetch pro extinto /api/upload.
 */
export async function uploadFoto(
  file: File,
  opts: { pasta?: string; tipo?: string; sessaoId?: string; resourceType?: "image" | "auto" } = {},
): Promise<UploadResult> {
  const sigRes = await apiFetch("/api/upload-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...opts, fileName: file.name }),
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
  const { cloudName, apiKey, timestamp, signature, folder, publicId, resourceType } = await sigRes.json();

  const cldForm = new FormData();
  cldForm.append("file", file);
  cldForm.append("api_key", apiKey);
  cldForm.append("timestamp", String(timestamp));
  cldForm.append("signature", signature);
  cldForm.append("folder", folder);
  cldForm.append("public_id", publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: cldForm,
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Falha no upload (Cloudinary ${res.status}).`);
  }

  return {
    url: data.secure_url as string,
    filename: data.public_id as string,
    fileSize: (data.bytes as number) ?? file.size,
    originalName: file.name,
  };
}
