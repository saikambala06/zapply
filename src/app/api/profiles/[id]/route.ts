import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import User from "@/models/User";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { toStringArray, toWebsites, toExperience, toEducation } from "@/lib/profile-shape";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const profile = (await Profile.findOne({ _id: params.id, userId: user._id }).lean()) as any;
  if (!profile) return fail("We couldn't find that profile.", 404);
  return ok({ ...profile, _id: String(profile._id) });
});

/**
 * Only these keys are writable through PATCH.
 *
 * `documents` is deliberately absent: it holds the base64 resume the extension
 * attaches to applications, and the browser doesn't carry that around. Letting
 * a profile save write the documents array wiped the file data on every save.
 * Uploads and deletions go through /api/resume/upload instead.
 *
 * `_id`, `userId`, `__v`, timestamps and `completeness` are server-owned.
 */
const MERGE_SECTIONS = ["personal", "workAuth", "compensation", "eeo"] as const;

const REPLACE_FIELDS: Record<string, (v: unknown) => unknown> = {
  label: (v) => String(v ?? "").slice(0, 80),
  targetRole: (v) => String(v ?? "").slice(0, 120),
  color: (v) => String(v ?? "#5B2AD6").slice(0, 20),
  summary: (v) => String(v ?? "").slice(0, 4000),
  skills: toStringArray,
  certifications: toStringArray,
  websites: toWebsites,
  experience: toExperience,
  education: toEducation,
};

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await connectDB();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("That request body wasn't valid JSON.", 400);
  }

  const profile = await Profile.findOne({ _id: params.id, userId: user._id });
  if (!profile) return fail("We couldn't find that profile.", 404);

  // Sections merge field-by-field so a partial save never clears untouched keys.
  for (const key of MERGE_SECTIONS) {
    if (body[key] === undefined || body[key] === null || typeof body[key] !== "object") continue;
    const current = (profile as any)[key]?.toObject?.() ?? (profile as any)[key] ?? {};
    (profile as any)[key] = { ...current, ...body[key] };
  }

  // Everything else is replaced wholesale, after coercion.
  for (const [key, coerce] of Object.entries(REPLACE_FIELDS)) {
    if (body[key] === undefined) continue;
    (profile as any)[key] = coerce(body[key]);
  }

  if (body.isDefault === true && !profile.isDefault) {
    await Profile.updateMany({ userId: user._id, _id: { $ne: profile._id } }, { isDefault: false });
    await User.findByIdAndUpdate(user._id, { activeProfileId: profile._id });
    profile.isDefault = true;
  }

  try {
    await profile.save();
  } catch (err: any) {
    // Turn a Mongoose cast/validation failure into something the user can act
    // on. This used to surface as a bare 500 with no indication of the culprit.
    if (err?.name === "ValidationError" || err?.name === "CastError") {
      const path = err.errors ? Object.keys(err.errors)[0] : err.path;
      return fail(
        `We couldn't save the "${(path ?? "profile").split(".")[0]}" section — the data wasn't in the expected format. Re-enter it and try again.`,
        422
      );
    }
    throw err;
  }

  const saved = profile.toObject();
  delete (saved as any).documents; // never echo base64 file data back to the browser
  return ok({ ...saved, _id: String(profile._id) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await connectDB();

  const count = await Profile.countDocuments({ userId: user._id });
  if (count <= 1) return fail("You need at least one profile. Edit this one instead of deleting it.", 400);

  const deleted = await Profile.findOneAndDelete({ _id: params.id, userId: user._id });
  if (!deleted) return fail("We couldn't find that profile.", 404);

  if (deleted.isDefault) {
    const next = await Profile.findOne({ userId: user._id });
    if (next) {
      next.isDefault = true;
      await next.save();
      await User.findByIdAndUpdate(user._id, { activeProfileId: next._id });
    }
  }
  return ok({ deleted: true });
});
