import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { connectDB } from "./db";
import User from "@/models/User";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-only-insecure-secret-change-me-in-production"
);
export const SESSION_COOKIE = "zapply_session";
const WEB_TTL = "30d";
const EXT_TTL = "180d";

export type TokenPayload = { sub: string; email: string; scope: "web" | "extension" };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function signToken(payload: TokenPayload, scope: "web" | "extension" = "web") {
  return new SignJWT({ ...payload, scope })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(scope === "extension" ? EXT_TTL : WEB_TTL)
    .sign(SECRET);
}

export async function readToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/**
 * Resolves the current user from either:
 *  - the httpOnly session cookie (web dashboard), or
 *  - an `Authorization: Bearer <token>` header (browser extension).
 */
export async function getCurrentUser(req?: NextRequest) {
  const bearer = req?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cookieToken = cookies().get(SESSION_COOKIE)?.value;
  const token = bearer || cookieToken;
  if (!token) return null;

  const payload = await readToken(token);
  if (!payload?.sub) return null;

  await connectDB();
  const user = (await User.findById(payload.sub).select("-passwordHash").lean()) as any;
  return user ? { ...user, _id: String(user._id) } : null;
}

export async function requireUser(req?: NextRequest): Promise<any> {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError(401, "You need to sign in to do that.");
  return user;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
