import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Kicks off the Google consent screen. */
export const GET = handler(async () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return fail("Google sign-in isn't configured on this deployment.", 503);

  // CSRF: a random state echoed back by Google and checked in the callback.
  const state = crypto.randomBytes(16).toString("hex");
  cookies().set("zapply_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${APP_URL}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(url.toString());
});
