import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await getCurrentUser();
  if (!user) return fail("Not signed in.", 401);
  await connectDB();
  const profiles = await Profile.find({ userId: user._id })
    .select("label isDefault completeness targetRole color")
    .lean();
  return ok({ user, profiles: profiles.map((p) => ({ ...p, _id: String(p._id) })) });
});
