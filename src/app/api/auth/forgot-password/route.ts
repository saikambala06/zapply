import { z } from "zod";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { ok, handler } from "@/lib/api";
import { createToken } from "@/lib/tokens";
import { sendEmail, resetEmail, emailEnabled } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const Body = z.object({ email: z.string().email("Enter a valid email address") });

export const POST = handler(async (req: Request) => {
  await rateLimit("forgot", clientIp(req), { limit: 5, windowSec: 900 });
  const { email } = Body.parse(await req.json());
  await connectDB();

  const user = await User.findOne({ email: email.toLowerCase() });

  // Always answer the same way. Telling an anonymous caller whether an address
  // has an account is an account-enumeration leak.
  const generic = { message: "If that email has an account, a reset link is on its way." };

  if (!user?.passwordHash) return ok(generic);

  const { raw, hash } = createToken();
  user.resetTokenHash = hash;
  user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const link = `${APP_URL}/reset-password?token=${raw}`;
  const result = await sendEmail({ to: user.email, ...resetEmail(user.name ?? "", link) });

  // With no mail provider configured, hand the link back in development so the
  // flow can be finished locally. Never in production.
  const devLink = !emailEnabled() && process.env.NODE_ENV !== "production" ? link : undefined;
  return ok({ ...generic, sent: result.sent, devLink });
});
