import crypto from "node:crypto";

/**
 * Single-use tokens for password reset and email verification.
 * Only the SHA-256 hash is stored, so a leaked database dump can't be used to
 * reset anyone's password.
 */
export function createToken() {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
