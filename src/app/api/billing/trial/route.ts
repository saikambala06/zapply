import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Starts the 3-day Premium trial. One per account. */
export const POST = handler(async () => {
  const user = await requireUser();
  await connectDB();

  if ((user as any).trialEndsAt) return fail("You've already used your free trial.", 400);

  const trialEndsAt = new Date(Date.now() + 3 * 86_400_000);
  await User.findByIdAndUpdate(user._id, { trialEndsAt });
  return ok({ trialEndsAt });
});
