import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { requireUser } from "@/lib/auth";
import { ok, handler } from "@/lib/api";
import { createToken, hashToken } from "@/lib/tokens";
import { sendEmail, verifyEmail, emailEnabled } from "@/lib/email";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** GET with ?token=… — the link in the email. Redirects back to the dashboard. */
export const GET = handler(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${APP_URL}/dashboard?verify=missing`);

  await connectDB();
  const user = await User.findOne({
    verifyTokenHash: hashToken(token),
    verifyTokenExpires: { $gt: new Date() },
  });
  if (!user) return NextResponse.redirect(`${APP_URL}/dashboard?verify=expired`);

  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyTokenExpires = undefined;
  await user.save();

  return NextResponse.redirect(`${APP_URL}/dashboard?verify=ok`);
});

/** POST — send (or resend) the confirmation email. */
export const POST = handler(async () => {
  const user = await requireUser();
  await connectDB();
  if ((user as any).emailVerified) return ok({ alreadyVerified: true });

  const { raw, hash } = createToken();
  await User.findByIdAndUpdate(user._id, {
    verifyTokenHash: hash,
    verifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const link = `${APP_URL}/api/auth/verify-email?token=${raw}`;
  const result = await sendEmail({ to: (user as any).email, ...verifyEmail((user as any).name ?? "", link) });

  return ok({
    sent: result.sent,
    devLink: !emailEnabled() && process.env.NODE_ENV !== "production" ? link : undefined,
  });
});
