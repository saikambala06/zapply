import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import SavedResponse from "@/models/SavedResponse";
import { requireUser } from "@/lib/auth";
import { ok, handler, cors } from "@/lib/api";
import { isPremium } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

/**
 * One payload the content script can cache: profiles, settings and every saved
 * answer. Called on install, on login, and whenever the dashboard pushes a change.
 */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser(req);
  await connectDB();

  const [profiles, responses] = await Promise.all([
    Profile.find({ userId: user._id }).sort({ isDefault: -1 }).lean(),
    SavedResponse.find({ userId: user._id }).select("question normalizedKey aliases category answer inputType options").lean(),
  ]);

  return ok({
    user: {
      id: String(user._id),
      name: (user as any).name,
      email: (user as any).email,
      premium: isPremium(user),
    },
    settings: (user as any).settings ?? {},
    activeProfileId: String((user as any).activeProfileId ?? profiles[0]?._id ?? ""),
    profiles: profiles.map((p) => ({ ...p, _id: String(p._id), userId: undefined })),
    responses: responses.map((r) => ({ ...r, _id: String(r._id) })),
    syncedAt: new Date().toISOString(),
  });
});
