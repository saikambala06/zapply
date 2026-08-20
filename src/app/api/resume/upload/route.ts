import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel body limit headroom

/**
 * Stores a resume/cover letter on the profile as a base64 data URL so the
 * extension can rebuild the File object and attach it to upload inputs.
 * Swap for object storage (S3/UploadThing) when files get large.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const profileId = String(form.get("profileId") ?? "");
  const kind = (String(form.get("kind") ?? "resume") || "resume") as "resume" | "coverLetter" | "transcript" | "other";

  if (!file) return fail("Choose a file to upload.", 400);
  if (file.size > MAX_BYTES) return fail("That file is over 4 MB. Compress it and try again.", 413);

  const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
  if (!allowed.includes(file.type)) return fail("Upload a PDF, DOC, DOCX or TXT file.", 415);

  await connectDB();
  const profile =
    (profileId && (await Profile.findOne({ _id: profileId, userId: user._id }))) ||
    (await Profile.findOne({ userId: user._id, isDefault: true })) ||
    (await Profile.findOne({ userId: user._id }));
  if (!profile) return fail("Create a profile first.", 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;

  if (kind === "resume") profile.documents.forEach((d: any) => { if (d.kind === "resume") d.isDefault = false; });

  profile.documents.push({
    kind,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    dataUrl,
    isDefault: kind === "resume",
    uploadedAt: new Date(),
  } as any);

  await profile.save();
  const saved = profile.documents[profile.documents.length - 1];
  return ok({ id: String((saved as any)._id), name: saved.name, size: saved.size, kind: saved.kind }, 201);
});

export const DELETE = handler(async (req: Request) => {
  const user = await requireUser();
  const { profileId, documentId } = await req.json();
  await connectDB();
  const profile = await Profile.findOne({ _id: profileId, userId: user._id });
  if (!profile) return fail("We couldn't find that profile.", 404);
  (profile.documents as any).id(documentId)?.deleteOne();
  await profile.save();
  return ok({ deleted: true });
});
