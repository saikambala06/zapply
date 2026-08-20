import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { requireUser, signToken } from "@/lib/auth";
import { ok, fail, handler, cors } from "@/lib/api";
import { isPremium } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

const CODE_TTL_MS = 10 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — easier to read off a screen

/** GET — dashboard asks for a fresh pairing code (needs a web session). */
export const GET = handler(async () => {
  const user = await requireUser();
  await connectDB();

  const code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  await User.findByIdAndUpdate(user._id, {
    pairingCode: code,
    pairingCodeExpires: new Date(Date.now() + CODE_TTL_MS),
  });

  return ok({ code, expiresInSeconds: CODE_TTL_MS / 1000 });
});

/** POST — extension redeems the code for a long-lived bearer token. */
export const POST = handler(async (req: Request) => {
  const { code } = await req.json();
  if (!code || typeof code !== "string") return fail("Enter the 6-character code from your dashboard.", 400);

  await connectDB();
  const user = await User.findOne({
    pairingCode: code.trim().toUpperCase(),
    pairingCodeExpires: { $gt: new Date() },
  });
  if (!user) return fail("That code is expired or incorrect. Generate a new one in Settings.", 401);

  user.pairingCode = undefined;
  user.pairingCodeExpires = undefined;
  user.lastSeenAt = new Date();
  await user.save();

  const token = await signToken({ sub: String(user._id), email: user.email, scope: "extension" }, "extension");

  return ok({
    token,
    user: { id: String(user._id), name: user.name, email: user.email, premium: isPremium(user) },
  });
});
