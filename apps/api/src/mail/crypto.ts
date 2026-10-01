import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config";
import { ApiError } from "../errors";

export interface SealedSecret {
  keyId: string;
  iv: string;
  tag: string;
  data: string;
}

interface Key { id: string; bytes: Buffer }

const toKey = (encoded: string | undefined): Key | null => {
  if (!encoded) return null;
  const bytes = Buffer.from(encoded, "base64");
  return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 12), bytes };
};

/** Current key first; the previous key only opens secrets during a rotation. */
export function mailKeys(current = config.MAIL_ENCRYPTION_KEY, previous = config.MAIL_ENCRYPTION_KEY_PREVIOUS): Key[] {
  return [toKey(current), toKey(previous)].filter((key): key is Key => key !== null);
}

export const mailKeyConfigured = (): boolean => Boolean(config.MAIL_ENCRYPTION_KEY);

export function assertMailKey(): void {
  if (!mailKeyConfigured()) throw new ApiError(503, "MAIL_ENCRYPTION_UNCONFIGURED", "Mail encryption key is not configured on the server");
}

/** AES-256-GCM with a random IV per secret and the key id stored alongside. */
export function sealSecret(plaintext: string, keys = mailKeys()): SealedSecret {
  const key = keys[0];
  if (!key) throw new ApiError(503, "MAIL_ENCRYPTION_UNCONFIGURED", "Mail encryption key is not configured on the server");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.bytes, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { keyId: key.id, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function openSecret(sealed: SealedSecret, keys = mailKeys()): string {
  const key = keys.find((candidate) => candidate.id === sealed.keyId);
  if (!key) throw new Error("No encryption key matches this secret");
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString("utf8");
}

/** True when the secret was sealed with an older key and should be re-sealed. */
export const needsReseal = (sealed: SealedSecret, keys = mailKeys()): boolean => keys[0] !== undefined && sealed.keyId !== keys[0].id;
