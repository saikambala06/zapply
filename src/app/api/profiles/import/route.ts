import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { isPremium } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** Fields we accept from an uploaded file. Everything else is ignored. */
const ALLOWED = [
  "label", "targetRole", "summary", "personal", "websites", "education",
  "experience", "skills", "certifications", "workAuth", "compensation", "eeo",
] as const;

/**
 * Restores a profile from an exported JSON file.
 * `mode: "merge"` overwrites the target profile in place; `mode: "new"` creates
 * another profile (Premium, since that's the multi-profile feature).
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await connectDB();

  const { data, mode = "merge", profileId } = await req.json();
  if (!data || typeof data !== "object") return fail("That file doesn't look like a Zapply profile export.", 400);
  if (!data.personal && !data.experience && !data.education) {
    return fail("That file is missing the profile sections. Export a fresh copy and try again.", 422);
  }

  const clean: Record<string, unknown> = {};
  for (const key of ALLOWED) if (data[key] !== undefined) clean[key] = data[key];

  if (mode === "new") {
    const count = await Profile.countDocuments({ userId: user._id });
    if (count >= 1 && !isPremium(user)) {
      return fail("Importing as a second profile needs Premium. Choose 'Replace current profile' instead.", 402);
    }
    if (count >= 8) return fail("You've reached the limit of 8 profiles.", 400);

    const created = await Profile.create({
      ...clean,
      userId: user._id,
      label: (clean.label as string) || `Imported profile ${count + 1}`,
      isDefault: count === 0,
      documents: [], // files aren't part of the export
    });
    return ok({ ...created.toObject(), _id: String(created._id) }, 201);
  }

  const target =
    (profileId && (await Profile.findOne({ _id: profileId, userId: user._id }))) ||
    (await Profile.findOne({ userId: user._id, isDefault: true })) ||
    (await Profile.findOne({ userId: user._id }));
  if (!target) return fail("We couldn't find a profile to import into.", 404);

  Object.assign(target, clean);
  await target.save();
  return ok({ ...target.toObject(), _id: String(target._id) });
});
