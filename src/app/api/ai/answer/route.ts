import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler, cors } from "@/lib/api";
import { isPremium } from "@/lib/plan";
import { aiEnabled, askAI, askAIJSON, profileToContext, AI_SETUP_HINT } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

/**
 * Premium — writes an answer to a custom application question using the
 * candidate's own profile as the only source of facts.
 */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!isPremium(user)) return fail("Generated answers are a Premium feature.", 402);
  if (!aiEnabled()) return fail(AI_SETUP_HINT, 503);

  const { question, jobTitle, company, jobDescription, profileId, maxWords = 120, options, fieldType = "text", multiple = false } = await req.json();
  if (!question) return fail("We need the question text.", 400);

  await connectDB();
  const profile =
    (profileId && (await Profile.findOne({ _id: profileId, userId: user._id }).lean())) ||
    (await Profile.findOne({ userId: user._id, isDefault: true }).lean()) ||
    (await Profile.findOne({ userId: user._id }).lean());
  if (!profile) return fail("Create a profile first.", 400);

  const baseSystem =
    "You help a job applicant answer application questions. Use only facts present in their profile — never invent employers, dates, numbers, credentials, immigration status, demographic information, or preferences. For sensitive questions, use an explicit profile value or choose the neutral decline option when one exists. Never guess.";

  const context = `Applicant profile:\n${profileToContext(profile)}\n\nRole: ${jobTitle ?? "?"} at ${company ?? "?"}\n${
    jobDescription ? `Job description:\n${String(jobDescription).slice(0, 4000)}\n` : ""
  }\nApplication question: "${question}"`;

  // Checkbox groups can have several correct choices. Force JSON array output
  // so the extension can select multiple real DOM checkboxes instead of trying
  // to interpret a sentence such as "Python and Java".
  if (fieldType === "checkbox" && multiple && options?.length) {
    const result = await askAIJSON<{ answers?: string[] }>(
      `${baseSystem}\nFor a checkbox/multi-select question, return only choices that are supported by the profile. Return an empty array if none are supported.`,
      `${context}\n\nAvailable choices (use these exact strings only): ${options.join(" | ")}\nReturn JSON exactly as: {"answers":["choice 1","choice 2"]}`,
      500
    );
    const answers = Array.isArray(result?.answers)
      ? result.answers.filter((x) => options.includes(x)).slice(0, 20)
      : [];
    return ok({ answer: answers });
  }

  const optionLine = options?.length
    ? `\n\nThis is a single-choice field. Reply with exactly one option from this list, verbatim: ${options.join(" | ")}`
    : `\n\nWrite at most ${maxWords} words. Plain prose, first person, no greeting, no sign-off, no markdown.`;

  const answer = await askAI(baseSystem, `${context}${optionLine}`, 600);
  return ok({ answer: String(answer).trim() });
});
