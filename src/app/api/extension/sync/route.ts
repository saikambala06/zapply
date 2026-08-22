import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Application from "@/models/Application";
import SavedResponse, { normalizeQuestion } from "@/models/SavedResponse";
import { requireUser } from "@/lib/auth";
import { ok, handler, cors } from "@/lib/api";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

function categorizeQuestion(q: string) {
  const s = q.toLowerCase();
  if (/sponsor|visa|authorized|work permit|immigration/.test(s)) return "work-authorization";
  if (/salary|compensation|pay|rate|bonus/.test(s)) return "compensation";
  if (/education|degree|school|university|college|gpa|major/.test(s)) return "education";
  if (/experience|employer|company|job title|role|responsibil/.test(s)) return "experience";
  if (/linkedin|github|portfolio|website|url/.test(s)) return "links";
  if (/location|city|state|address|country|phone|email/.test(s)) return "contact";
  if (/gender|race|ethnicity|veteran|disability|hispanic/.test(s)) return "eeo";
  if (/relocat|remote|hybrid|onsite|start date|notice period|availability/.test(s)) return "availability";
  return "general";
}

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
    for (const r of body.responses) {
      const question = String(r?.question || "").trim();
      const answer = String(r?.answer ?? "").trim();
      const normalizedKey = normalizeQuestion(question);
      if (!question || !answer || !normalizedKey) continue;

      const doc = await SavedResponse.findOne({ userId: user._id, normalizedKey });
      if (doc) {
        const aliases = new Set([...(doc.aliases || []), question]);
        doc.question = question;
        doc.answer = answer;
        doc.inputType = r.inputType || doc.inputType || "text";
        doc.options = Array.isArray(r.options) ? r.options.slice(0, 50) : doc.options;
        doc.ats = r.ats || doc.ats;
        doc.lastDomain = r.domain || doc.lastDomain;
        doc.lastUsedAt = new Date();
        doc.category = categorizeQuestion(question);
        doc.aliases = Array.from(aliases).slice(-30);
        doc.useCount = (doc.useCount || 0) + 1;
        await doc.save();
      } else {
        await SavedResponse.create({
          userId: user._id,
          question,
          normalizedKey,
          aliases: [question],
          answer,
          inputType: r.inputType || "text",
          options: Array.isArray(r.options) ? r.options.slice(0, 50) : [],
          ats: r.ats,
          lastDomain: r.domain,
          lastUsedAt: new Date(),
          category: categorizeQuestion(question),
          useCount: 1,
          source: "user",
        });
      }
      savedCount++;
    }
  }

  return ok({
    applicationId: application ? String(application._id) : null,
    responsesSaved: savedCount,
    syncedAt: new Date().toISOString(),
  });
});
