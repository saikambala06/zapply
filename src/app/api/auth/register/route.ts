import { z } from "zod";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Profile from "@/models/Profile";
import { hashPassword, signToken, setSessionCookie } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const Body = z.object({
  name: z.string().min(1, "Tell us your name").max(80),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export const POST = handler(async (req: Request) => {
  await rateLimit("register", clientIp(req), { limit: 5, windowSec: 3600 });
  const { name, email, password } = Body.parse(await req.json());
  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return fail("An account with that email already exists. Sign in instead.", 409);

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    onboardedAt: new Date(),
    trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3-day Premium trial
  });

  const profile = await Profile.create({
    userId: user._id,
    label: "Default profile",
    isDefault: true,
    personal: {
      firstName: name.split(" ")[0],
      lastName: name.split(" ").slice(1).join(" "),
      email: user.email,
    },
  });
  user.activeProfileId = profile._id;
  await user.save();

  const token = await signToken({ sub: String(user._id), email: user.email, scope: "web" });
  await setSessionCookie(token);

  return ok({ id: String(user._id), name: user.name, email: user.email, plan: user.plan });
});
