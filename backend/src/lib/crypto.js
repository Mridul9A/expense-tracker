/**
 * Field-level encryption for sensitive text (AES-256-GCM, node:crypto — no new
 * dependency). Protects against someone with raw database access (a stolen
 * Turso token, a DB dump) reading financial data in plaintext; it does NOT
 * protect against a compromised app server, which holds the key.
 *
 * Stored format: "<iv>.<authTag>.<ciphertext>", each base64.
 *
 * decrypt() falls back to returning the raw value if it isn't in that format.
 * This matters because the database already has real plaintext data written
 * before this file existed — those rows must stay readable, not crash the app.
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function resolveKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    console.warn("ENCRYPTION_KEY not set — using an insecure default. Set ENCRYPTION_KEY in production.");
    return crypto.createHash("sha256").update("dev-insecure-key-change-me").digest();
  }
  // A 64-char hex string is used directly as raw key bytes (the documented,
  // recommended format). Anything else — including whatever format a host's
  // auto-generated secret happens to produce — is hashed down to 32 bytes
  // instead of rejected, so a non-hex value can never crash startup.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

const KEY = resolveKey();

export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decrypt(stored) {
  if (stored === null || stored === undefined) return stored;
  const value = String(stored);
  const parts = value.split(".");
  if (parts.length !== 3) return value; // not our format — legacy plaintext

  try {
    const [ivB64, tagB64, ctB64] = parts;
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return value; // failed to decrypt — treat as legacy plaintext rather than crash
  }
}

// Amounts are stored as integer cents. Legacy rows have a real SQLite INTEGER
// in this column (libsql returns it as a JS number); new rows have an
// encrypted string. Handle both.
export function encryptAmount(cents) {
  return encrypt(String(cents));
}

export function decryptAmount(stored) {
  if (stored === null || stored === undefined) return 0;
  if (typeof stored === "number") return stored; // legacy plaintext cents
  const decrypted = decrypt(stored);
  const n = parseInt(decrypted, 10);
  return Number.isNaN(n) ? 0 : n;
}
