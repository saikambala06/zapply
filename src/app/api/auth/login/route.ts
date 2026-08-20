import { z } from "zod";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyPassword, signToken, setSessionCookie } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const POST = handler(async (req: Request) => {
  const { email, password } = Body.parse(await req.json());
  await rateLimit("login-ip", clientIp(req), { limit: 20, windowSec: 900 });
  await rateLimit("login", email.toLowerCase(), { limit: 10, windowSec: 900 });
  await connectDB();

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user?.passwordHash) return fail("That email and password don't match an account.", 401);
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return fail("That email and password don't match an account.", 401);

  user.lastSeenAt = new Date();
  await user.save();

  const token = await signToken({ sub: String(user._id), email: user.email, scope: "web" });
  await setSessionCookie(token);
  return ok({ id: String(user._id), name: user.name, email: user.email, plan: user.plan });
});
