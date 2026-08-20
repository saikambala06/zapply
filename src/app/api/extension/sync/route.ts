import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Application from "@/models/Application";
import SavedResponse, { normalizeQuestion } from "@/models/SavedResponse";
import { requireUser } from "@/lib/auth";
import { ok, handler, cors } from "@/lib/api";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

/**
 * The extension posts here after a successful autofill/submit:
 *   { application: {...}, responses: [{question, answer, inputType}] }
 * Both halves are optional so a page can report responses without an application.
 */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser(req);
  await connectDB();
  const body = await req.json();

  let application = null;
  if (body.application?.jobTitle) {
    const a = body.application;
    application = await Application.findOneAndUpdate(
      { userId: user._id, url: a.url || undefined },
      {
        $set: {
          userId: user._id,
          jobTitle: a.jobTitle,
          company: a.company,
          companyDomain: a.companyDomain,
          location: a.location,
          url: a.url,
          ats: a.ats,
          source: "extension",
          profileId: a.profileId || undefined,
          lastActivityAt: new Date(),
          autofill: a.autofill ?? {},
        },
        $setOnInsert: {
          stage: "applied",
          appliedAt: a.appliedAt ? new Date(a.appliedAt) : new Date(),
          events: [{ stage: "applied", at: new Date() }],
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  let savedCount = 0;
  if (Array.isArray(body.responses) && body.responses.length) {
    const ops = body.responses
      .filter((r: any) => r?.question && String(r.answer ?? "").trim())
      .map((r: any) => ({
        updateOne: {
          filter: { userId: user._id, normalizedKey: normalizeQuestion(r.question) },
          update: {
            $set: {
              userId: user._id,
              question: r.question,
              normalizedKey: normalizeQuestion(r.question),
              answer: String(r.answer),
              inputType: r.inputType || "text",
              options: r.options || [],
              ats: r.ats,
              lastDomain: r.domain,
              lastUsedAt: new Date(),
            },
            $inc: { useCount: 1 },
            $setOnInsert: { source: "user" },
          },
          upsert: true,
        },
      }));
    if (ops.length) {
      const res = await SavedResponse.bulkWrite(ops, { ordered: false });
      savedCount = (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
    }
  }

  return ok({
    applicationId: application ? String(application._id) : null,
    responsesSaved: savedCount,
    syncedAt: new Date().toISOString(),
  });
});
