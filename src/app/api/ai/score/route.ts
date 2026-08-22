import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Profile from "@/models/Profile";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler, cors } from "@/lib/api";
import { isPremium } from "@/lib/plan";
import { aiEnabled, askAIJSON, profileToContext } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

type Scored = { profileId: string; score: number; reason: string };

/**
 * Premium — scores each of the user's profiles against a job description and
 * tells the extension which one to autofill with.
 */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser(req);
  if (!isPremium(user)) return fail("Profile scoring is a Premium feature.", 402);

  const { jobTitle, company, jobDescription } = await req.json();
  if (!jobDescription && !jobTitle) return fail("We need the job title or description to score against.", 400);

  await connectDB();
  const profiles = await Profile.find({ userId: user._id }).lean();
  if (!profiles.length) return fail("Create a profile first.", 400);

  if (!aiEnabled()) {
    // Keyword overlap fallback so the feature still works without an API key.
    // Crude, but it ranks profiles sensibly and costs nothing.
    const text = `${jobTitle ?? ""} ${jobDescription ?? ""}`.toLowerCase();
    const scored: Scored[] = profiles.map((p: any) => {
      const skills: string[] = p.skills ?? [];
      const hits = skills.filter((s) => text.includes(s.toLowerCase()));
      const roleHit = p.targetRole && text.includes(String(p.targetRole).toLowerCase()) ? 20 : 0;
      const score = Math.min(98, 40 + roleHit + hits.length * 6);
      return {
        profileId: String(p._id),
        score,
        reason: hits.length ? `Matches ${hits.slice(0, 5).join(", ")}.` : "Based on role and title overlap.",
      };
    });
    scored.sort((a, b) => b.score - a.score);
    return ok({ best: scored[0], scores: scored, engine: "keyword" });
  }

  const result = await askAIJSON<{ scores: Scored[]; summary: string }>(
    "You score how well a candidate profile fits a job posting. Be honest and calibrated: 90+ means a strong match, 50 means plausible, below 40 means a stretch.",
    `Job: ${jobTitle ?? ""} at ${company ?? ""}\n\nDescription:\n${(jobDescription ?? "").slice(0, 6000)}\n\n${profiles
      .map((p: any, i) => `PROFILE ${i} (id: ${p._id}, label: ${p.label}):\n${profileToContext(p)}`)
      .join("\n\n")}\n\nReturn JSON: {"scores":[{"profileId":"...","score":0-100,"reason":"one sentence"}],"summary":"one sentence on the strongest gap"}`
  );

  const scores = (result.scores ?? []).sort((a: Scored, b: Scored) => b.score - a.score);
  return ok({ best: scores[0], scores, summary: result.summary, engine: "groq" });
});
