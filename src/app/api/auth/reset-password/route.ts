import { z } from "zod";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { ok, fail, handler } from "@/lib/api";
import { hashPassword, signToken, setSessionCookie } from "@/lib/auth";
import { hashToken } from "@/lib/tokens";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10, "That reset link is malformed"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export const POST = handler(async (req: Request) => {
  await rateLimit("reset", clientIp(req), { limit: 10, windowSec: 900 });
  const { token, password } = Body.parse(await req.json());
  await connectDB();

  const user = await User.findOne({
    resetTokenHash: hashToken(token),
    resetTokenExpires: { $gt: new Date() },
  });
  if (!user) return fail("That reset link has expired or already been used. Request a new one.", 400);

  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.emailVerified = true; // clicking the emailed link proves they own the address
  await user.save();

  // Sign them straight in — they've just proven ownership.
  const session = await signToken({ sub: String(user._id), email: user.email, scope: "web" });
  await setSessionCookie(session);

  return ok({ id: String(user._id), email: user.email });
});
