import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Profile from "@/models/Profile";
import { signToken, setSessionCookie } from "@/lib/auth";
import { handler } from "@/lib/api";

export const dynamic = "force-dynamic";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const bail = (reason: string) => NextResponse.redirect(`${APP_URL}/auth?error=${reason}`);

export const GET = handler(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const expected = cookies().get("zapply_oauth_state")?.value;
  cookies().set("zapply_oauth_state", "", { path: "/", maxAge: 0 });

  if (searchParams.get("error")) return bail("cancelled");
  if (!code) return bail("missing_code");
  if (!state || state !== expected) return bail("bad_state");

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return bail("not_configured");

  // Exchange the one-time code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${APP_URL}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return bail("token_exchange_failed");
  const tokens = await tokenRes.json();

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) return bail("profile_fetch_failed");
  const g = await profileRes.json();
  if (!g.email) return bail("no_email");

  await connectDB();
  const email = String(g.email).toLowerCase();
  let user = await User.findOne({ email });

  if (user) {
    // Link Google to the existing account rather than creating a duplicate.
    user.providerId ??= g.sub;
    user.avatarUrl ??= g.picture;
    user.name ??= g.name;
    if (g.email_verified) user.emailVerified = true;
    user.lastSeenAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      email,
      name: g.name || email.split("@")[0],
      avatarUrl: g.picture,
      provider: "google",
      providerId: g.sub,
      emailVerified: Boolean(g.email_verified),
      onboardedAt: new Date(),
      trialEndsAt: new Date(Date.now() + 3 * 86_400_000),
    });

    const profile = await Profile.create({
      userId: user._id,
      label: "Default profile",
      isDefault: true,
      personal: {
        firstName: g.given_name || "",
        lastName: g.family_name || "",
        email,
      },
    });
    user.activeProfileId = profile._id;
    await user.save();
  }

  const session = await signToken({ sub: String(user._id), email: user.email, scope: "web" });
  await setSessionCookie(session);

  return NextResponse.redirect(`${APP_URL}/dashboard`);
});
