import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler, cors } from "@/lib/api";
import { isPremium } from "@/lib/plan";
import { aiEnabled, askAI, profileToContext, AI_SETUP_HINT } from "@/lib/ai";

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

  const { question, jobTitle, company, jobDescription, profileId, maxWords = 120, options } = await req.json();
  if (!question) return fail("We need the question text.", 400);

  await connectDB();
  const profile =
    (profileId && (await Profile.findOne({ _id: profileId, userId: user._id }).lean())) ||
    (await Profile.findOne({ userId: user._id, isDefault: true }).lean()) ||
    (await Profile.findOne({ userId: user._id }).lean());
  if (!profile) return fail("Create a profile first.", 400);

  const optionLine = options?.length
    ? `\n\nThis is a multiple-choice field. Reply with exactly one of these options verbatim and nothing else: ${options.join(" | ")}`
    : `\n\nWrite at most ${maxWords} words. Plain prose, first person, no greeting, no sign-off, no markdown.`;

  const answer = await askAI(
    "You help a job applicant answer application questions. Use only facts present in their profile — never invent employers, dates, numbers or credentials. Match the applicant's plain, direct voice. If the profile lacks the information, give a short honest answer rather than fabricating.",
    `Applicant profile:\n${profileToContext(profile)}\n\nRole: ${jobTitle ?? "?"} at ${company ?? "?"}\n${
      jobDescription ? `Job description:\n${String(jobDescription).slice(0, 4000)}\n` : ""
    }\nApplication question: "${question}"${optionLine}`,
    600
  );

  return ok({ answer });
});
