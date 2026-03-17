import { randomBytes, createCipheriv, createDecipheriv, createHmac } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derive purpose-specific keys from a master secret using HMAC-based key derivation.
 * This ensures encryption and HMAC use independent keys (NIST SP 800-108 compliant).
 */
function deriveKey(masterSecret: string, purpose: "enc" | "hmac"): Buffer {
  return Buffer.from(
    createHmac("sha256", masterSecret).update(`skyfi-mcp:${purpose}`).digest(),
  );
}

export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret, "enc");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export function decrypt(ciphertext: string, secret: string): string {
  const key = deriveKey(secret, "enc");
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf-8");
}

export function hmacHash(value: string, secret: string): string {
  const key = deriveKey(secret, "hmac");
  return createHmac("sha256", key).update(value).digest("hex");
}

export function generateToken(prefix: "mcp_sess_" | "mcp_svc_"): string {
  return `${prefix}${randomBytes(16).toString("hex")}`;
}
