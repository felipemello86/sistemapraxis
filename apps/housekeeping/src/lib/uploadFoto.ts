import { apiFetch } from "./apiFetch";

export type UploadResult = { url: string; filename: string; fileSize: number; originalName: string };

// Redimensiona/recomprime a imagem no navegador ANTES de subir. Até
// 04/08/2026 essa lógica vivia duplicada dentro de CamareiraView.tsx e
// GovernantaView.tsx (cada uma chamando comprimirImagem antes de
// uploadFoto) — só cobria 5 dos 7 pontos de upload do app; "Seleção: anexo
// de queixa" e "Falhas Gerenciais: resolução" ficavam sem comprimir.
// Centralizado aqui dentro de uploadFoto pra cobrir todos os pontos
// automaticamente, presentes e futuros, sem depender de cada tela lembrar
// de chamar comprimirImagem por conta própria — motivado por 2 crashes reais
// no TestFlight do app de Manutenção ("Adicionar foto na inspeção quebrou"):
// foto tirada na hora pela câmera de um iPhone recente vem em resolução
// altíssima (12MP+) e decodifica como bitmap gigante na memória do WebView,
// mesmo o arquivo em si tendo só alguns MB. Reduzir o lado maior pra no
// máximo 1600px e recomprimir em JPEG evita essa pressão de memória.
// Só se aplica a imagens (ver checagem de file.type em uploadFoto) — anexo
// de queixa aceita PDF etc. (resourceType="auto"), que passa direto.
// Implementação já endurecida contra 2 bugs reais de WebKit mobile:
// canvas.getContext("2d") pode retornar null em fotos muito grandes, e
// canvas.toBlob pode simplesmente nunca chamar o callback — sem os
// fallbacks abaixo, qualquer um dos dois deixaria a Promise pendurada pra
// sempre e o upload travado em "Enviando...". Por isso: qualquer exceção
// resolve com o arquivo original sem compressão, e um timeout de segurança
// garante que a função sempre retorna em poucos segundos.
async function comprimirImagem(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
  const tentativa = new Promise<File>((resolve) => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      const falhar = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };
      img.onload = () => {
        try {
          URL.revokeObjectURL(objectUrl);
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(file);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
              } else {
                resolve(file);
              }
            },
            "image/jpeg",
            quality,
          );
        } catch {
          resolve(file);
        }
      };
      img.onerror = falhar;
      img.src = objectUrl;
    } catch {
      resolve(file);
    }
  });

  const timeout = new Promise<File>((resolve) => {
    setTimeout(() => resolve(file), 8000);
  });

  return Promise.race([tentativa, timeout]);
}

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
 * Comprime automaticamente (ver comprimirImagem acima) quando `file` é uma
 * imagem.
 */
export async function uploadFoto(
  file: File,
  opts: { pasta?: string; tipo?: string; sessaoId?: string; resourceType?: "image" | "auto" } = {},
): Promise<UploadResult> {
  const arquivo = file.type.startsWith("image/") ? await comprimirImagem(file) : file;
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
  cldForm.append("file", arquivo);
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
    fileSize: (data.bytes as number) ?? arquivo.size,
    originalName: file.name,
  };
}
