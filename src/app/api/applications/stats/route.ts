import { connectDB } from "@/lib/db";
import Application from "@/models/Application";
import { requireUser } from "@/lib/auth";
import { ok, handler } from "@/lib/api";
import { buildActivity } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  await connectDB();

  const rows = await Application.find({ userId: user._id })
    .select("stage appliedAt ats company autofill")
    .lean();

  const byStage: Record<string, number> = {};
  const byAts: Record<string, number> = {};
  rows.forEach((r) => {
    byStage[r.stage as string] = (byStage[r.stage as string] ?? 0) + 1;
    if (r.ats) byAts[r.ats] = (byAts[r.ats] ?? 0) + 1;
  });

  const total = rows.length;
  const interviews = (byStage.screen ?? 0) + (byStage.interview ?? 0) + (byStage.offer ?? 0);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = rows.filter((r) => new Date(r.appliedAt as Date) >= startOfDay).length;

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const week = rows.filter((r) => new Date(r.appliedAt as Date) >= startOfWeek).length;

  const filled = rows.reduce((sum, r: any) => sum + (r.autofill?.fieldsFilled ?? 0), 0);
  // 15 minutes saved per application is the number the category advertises;
  // we compute from fields actually filled instead — ~7s of typing per field.
  const minutesSaved = Math.round((filled * 7) / 60);

  return ok({
    total,
    today,
    week,
    interviews,
    responseRate: total ? Math.round((interviews / total) * 100) : 0,
    offerRate: total ? Math.round(((byStage.offer ?? 0) / total) * 100) : 0,
    byStage,
    byAts,
    fieldsFilled: filled,
    minutesSaved,
    dailyGoal: (user as any).settings?.dailyGoal ?? 10,
    activity: buildActivity(rows.map((r) => r.appliedAt as Date)),
  });
});
