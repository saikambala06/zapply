import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // Keep the stored base64 payload safely below Vercel/Mongo document limits

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
  if (file.size > MAX_BYTES) return fail("That resume is over 4 MB. Please export/compress it to a smaller PDF or DOCX and try again.", 413);

  const allowed = ["application/pdf", "application/msword", "application/vnd.ms-word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream", "text/plain", "text/markdown", "text/rtf", "application/rtf", "image/png", "image/jpeg", "image/webp"];
  const extOk = /\.(pdf|doc|docx|rtf|txt|md|csv|html?|png|jpe?g|webp)$/i.test(file.name);
  if (!allowed.includes(file.type) && !extOk) return fail("Upload a PDF, DOC, DOCX, RTF, TXT, PNG, JPG or WEBP file.", 415);

  await connectDB();
  const profile =
    (profileId && (await Profile.findOne({ _id: profileId, userId: user._id }))) ||
    (await Profile.findOne({ userId: user._id, isDefault: true })) ||
    (await Profile.findOne({ userId: user._id }));
  if (!profile) return fail("Create a profile first.", 400);

  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return fail("That file is empty. Choose a valid resume and try again.", 400);

  // IMPORTANT: don't call profile.save() after adding a large base64 string.
  // Mongoose serializes the entire Profile document and MongoDB has a 16 MB
  // BSON document limit. A 4 MB PDF becomes ~5.4 MB as base64 and is still safe,
  // while the atomic update below avoids rewriting unrelated profile data.
  const dataUrl = `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
  const document = {
    kind,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
    isDefault: kind === "resume",
    uploadedAt: new Date(),
  };

  if (kind === "resume") {
    // Keep these as two updates. MongoDB can reject a single update that both
    // changes an array element and pushes to that same array.
    await Profile.updateOne(
      { _id: profile._id, userId: user._id },
      { $set: { "documents.$[resume].isDefault": false } },
      { arrayFilters: [{ "resume.kind": "resume" }] }
    );
    await Profile.updateOne(
      { _id: profile._id, userId: user._id },
      { $push: { documents: document } }
    );
  } else {
    await Profile.updateOne(
      { _id: profile._id, userId: user._id },
      { $push: { documents: document } }
    );
  }

  // Fetch only the new document metadata. This also proves the write succeeded
  // before returning success to the browser.
  const updated = (await Profile.findOne({ _id: profile._id, userId: user._id })
    .select("documents")
    .lean()) as { documents?: any[] } | null;
  const documents = Array.isArray(updated?.documents) ? updated.documents : [];
  const saved = documents.length > 0 ? documents[documents.length - 1] : null;
  if (!saved) return fail("The resume could not be saved. Please try again.", 500);

  return ok({
    id: String(saved._id),
    name: saved.name,
    size: saved.size,
    kind: saved.kind,
    mimeType: saved.mimeType,
    isDefault: saved.isDefault,
  }, 201);
});

export const DELETE = handler(async (req: Request) => {
  const user = await requireUser();
  const { profileId, documentId } = await req.json();
  if (!profileId || !documentId) return fail("Profile and document are required.", 400);
  await connectDB();
  const result = await Profile.updateOne(
    { _id: profileId, userId: user._id },
    { $pull: { documents: { _id: documentId } } }
  );
  if (!result.matchedCount) return fail("We couldn't find that profile.", 404);
  return ok({ deleted: result.modifiedCount > 0 });
});
