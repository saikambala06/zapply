import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import User from "@/models/User";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { isPremium } from "@/lib/plan";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  await connectDB();
  const profiles = await Profile.find({ userId: user._id })
    .select("-documents.dataUrl")
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();
  return ok(profiles.map((p) => ({ ...p, _id: String(p._id), userId: String(p.userId) })));
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await connectDB();

  const count = await Profile.countDocuments({ userId: user._id });
  if (count >= 1 && !isPremium(user)) {
    return fail("Multiple profiles are a Premium feature. Start a free trial to add another.", 402);
  }
  if (count >= 8) return fail("You've reached the limit of 8 profiles.", 400);

  const body = await req.json().catch(() => ({}));
  const profile = await Profile.create({
    userId: user._id,
    label: body.label || `Profile ${count + 1}`,
    targetRole: body.targetRole || "",
    isDefault: count === 0,
    personal: { email: user.email, ...(body.personal || {}) },
  });

  if (count === 0) await User.findByIdAndUpdate(user._id, { activeProfileId: profile._id });
  return ok({ ...profile.toObject(), _id: String(profile._id) }, 201);
});
