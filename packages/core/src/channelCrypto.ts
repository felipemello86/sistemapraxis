import crypto from "crypto";

// Cifra o access token de cada ChannelConnection antes de gravar no banco
// (06/08/2026) — AES-256-GCM com Node `crypto` nativo em vez de trazer um
// serviço de KMS/Vault: dado o volume baixo (um token por tenant que
// conecta WhatsApp) e a filosofia do resto da suíte (evitar infra nova
// sempre que uma solução simples resolve), isso é suficiente — a chave em
// si (CHANNEL_TOKEN_ENCRYPTION_KEY) mora só nas env vars da Vercel, nunca
// no banco nem no código.
//
// Formato gravado: "<ivHex>:<authTagHex>:<cifradoHex>" — os três precisam
// viajar juntos pra decifrar depois (IV não é segredo, mas precisa ser
// único por cifragem; authTag garante integridade — sem ele, uma alteração
// no banco não seria detectada).

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.CHANNEL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CHANNEL_TOKEN_ENCRYPTION_KEY não configurada — necessária pra cifrar/decifrar tokens de canal.");
  }
  // Aceita tanto hex (64 chars = 32 bytes) quanto base64 — hex é o formato
  // recomendado no comando de geração (ver comentário em .env.example).
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CHANNEL_TOKEN_ENCRYPTION_KEY inválida — precisa resultar em exatamente 32 bytes (256 bits).");
  }
  return key;
}

export function cifrarToken(textoPlano: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96 bits — recomendado pro GCM
  const cifra = crypto.createCipheriv(ALGORITHM, key, iv);
  const cifrado = Buffer.concat([cifra.update(textoPlano, "utf8"), cifra.final()]);
  const authTag = cifra.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${cifrado.toString("hex")}`;
}

export function decifrarToken(valorCifrado: string): string {
  const key = getKey();
  const [ivHex, authTagHex, cifradoHex] = valorCifrado.split(":");
  if (!ivHex || !authTagHex || !cifradoHex) {
    throw new Error("Formato inválido de token cifrado — esperado 'iv:authTag:cifrado'.");
  }
  const decifra = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decifra.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decifrado = Buffer.concat([decifra.update(Buffer.from(cifradoHex, "hex")), decifra.final()]);
  return decifrado.toString("utf8");
}
