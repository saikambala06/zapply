import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Application from "@/models/Application";
import { requireUser } from "@/lib/auth";
import { ok, handler, cors } from "@/lib/api";

export const dynamic = "force-dynamic";
export const OPTIONS = () => cors();

/** Strips tracking params so the same posting isn't seen as two URLs. */
function canonical(raw: string) {
  try {
    const u = new URL(raw);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gh_src", "src", "ref"]
      .forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

/**
 * Asked by the extension before it fills: have I already applied here?
 * Matches on the canonical URL first, then falls back to company + title, which
 * catches the same job reposted under a new requisition id.
 */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser(req);
  await connectDB();

  const { url, jobTitle, company } = await req.json();
  const clean = url ? canonical(url) : null;

  let match = null;
  if (clean) {
    match = await Application.findOne({
      userId: user._id,
      url: { $regex: `^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` },
    })
      .select("jobTitle company stage appliedAt url")
      .lean();
  }

  if (!match && jobTitle && company) {
    match = await Application.findOne({
      userId: user._id,
      company: { $regex: `^${String(company).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      jobTitle: { $regex: `^${String(jobTitle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    })
      .select("jobTitle company stage appliedAt url")
      .lean();
  }

  return ok({
    duplicate: Boolean(match),
    application: match
      ? {
          id: String((match as any)._id),
          jobTitle: (match as any).jobTitle,
          company: (match as any).company,
          stage: (match as any).stage,
          appliedAt: (match as any).appliedAt,
        }
      : null,
  });
});
