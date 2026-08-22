import Link from "next/link";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Application from "@/models/Application";
import Profile from "@/models/Profile";
import SavedResponse from "@/models/SavedResponse";
import { buildActivity, relativeDate } from "@/lib/utils";
import PairExtension from "@/components/dashboard/PairExtension";
import ActivityGrid from "@/components/dashboard/ActivityGrid";
import { ArrowUpRight, Briefcase, Target, MessageSquareQuote, Clock } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const STAGE_TONE: Record<string, string> = {
  saved: "bg-canvas text-ink-soft",
  applied: "bg-brand-50 text-brand-600",
  screen: "bg-amber-500/15 text-amber-600",
  interview: "bg-teal-500/10 text-teal-600",
  offer: "bg-teal-500/20 text-teal-600",
  rejected: "bg-danger-500/10 text-danger-500",
  ghosted: "bg-canvas text-ink-faint",
};

export default async function OverviewPage() {
  const user = await requireUser();
  await connectDB();

  const [apps, profile, responseCount] = await Promise.all([
    Application.find({ userId: user._id }).sort({ appliedAt: -1 }).lean(),
    Profile.findOne({ userId: user._id, isDefault: true }).lean(),
    SavedResponse.countDocuments({ userId: user._id }),
  ]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = apps.filter((a) => new Date(a.appliedAt as Date) >= startOfDay).length;

  const byStage = apps.reduce<Record<string, number>>((acc, a) => {
    acc[a.stage as string] = (acc[a.stage as string] ?? 0) + 1;
    return acc;
  }, {});
  const interviews = (byStage.screen ?? 0) + (byStage.interview ?? 0) + (byStage.offer ?? 0);
  const fieldsFilled = apps.reduce((s, a: any) => s + (a.autofill?.fieldsFilled ?? 0), 0);
  const minutesSaved = Math.round((fieldsFilled * 7) / 60);
  const goal = (user as any).settings?.dailyGoal ?? 10;
  const completeness = (profile as any)?.completeness ?? 0;

  const stats = [
    { label: "Applications sent", value: apps.length, icon: Briefcase, sub: `${today} today` },
    {
      label: "Reply rate",
      value: apps.length ? `${Math.round((interviews / apps.length) * 100)}%` : "—",
      icon: Target,
      sub: `${interviews} moved forward`,
    },
    { label: "Saved answers", value: responseCount, icon: MessageSquareQuote, sub: "reused automatically" },
    {
      label: "Time saved",
      value: minutesSaved >= 60 ? `${(minutesSaved / 60).toFixed(1)}h` : `${minutesSaved}m`,
      icon: Clock,
      sub: `${fieldsFilled} fields filled`,
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-.02em]">
            {greeting()}, {(user as any).name?.split(" ")[0] || "there"}.
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            {today >= goal
              ? `You hit your goal of ${goal} today. Anything past this is a bonus.`
              : `${goal - today} more application${goal - today === 1 ? "" : "s"} to reach today's goal.`}
          </p>
        </div>
        <Link href="/dashboard/applications" className="btn-ghost btn-sm">
          Open tracker
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Stat row */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-soft">{s.label}</p>
              <s.icon className="h-4 w-4 text-brand-400" />
            </div>
            <p className="mt-3 font-display text-[30px] font-extrabold leading-none tracking-tight">{s.value}</p>
            <p className="mt-2 font-mono text-[11px] text-ink-faint">{s.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* Activity */}
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Last 12 weeks</h2>
              <span className="font-mono text-[11px] text-ink-faint">daily goal: {goal}</span>
            </div>
            <ActivityGrid data={buildActivity(apps.map((a) => a.appliedAt as Date))} goal={goal} />
          </section>

          {/* Recent */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-[15px] font-bold">Recent applications</h2>
              <Link href="/dashboard/applications" className="font-mono text-[11px] text-brand-600 hover:underline">
                View all
              </Link>
            </div>

            {apps.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-semibold">No applications yet</p>
                <p className="mx-auto mt-1.5 max-w-[320px] text-[14px] text-ink-soft">
                  Pair the extension, then open any job posting. The first one you submit shows up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {apps.slice(0, 6).map((a: any) => (
                  <li key={String(a._id)} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas font-display text-[13px] font-bold text-ink-soft">
                      {(a.company ?? a.jobTitle ?? "?")[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{a.jobTitle}</p>
                      <p className="truncate font-mono text-[11px] text-ink-faint">
                        {[a.company, a.location].filter(Boolean).join(" · ") || a.ats || "—"}
                      </p>
                    </div>
                    <span className="hidden font-mono text-[11px] text-ink-faint sm:block">
                      {relativeDate(a.appliedAt)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                        STAGE_TONE[a.stage] ?? STAGE_TONE.applied
                      }`}
                    >
                      {a.stage}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <PairExtension />

          {/* Profile strength */}
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Profile strength</h2>
              <span className="font-mono text-[13px] font-semibold text-brand-600">{completeness}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-500 transition-all"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              {completeness >= 90
                ? "Your profile covers everything a typical application asks for."
                : "Fields you leave blank are fields you'll type by hand. Fill the gaps once."}
            </p>
            <Link href="/dashboard/profile" className="btn-ghost btn-sm mt-4 w-full">
              Edit profile
            </Link>
          </section>

          {/* Pipeline */}
          <section className="card p-5">
            <h2 className="text-[15px] font-bold">Pipeline</h2>
            <ul className="mt-4 space-y-2.5">
              {["applied", "screen", "interview", "offer", "rejected"].map((stage) => {
                const count = byStage[stage] ?? 0;
                const pct = apps.length ? (count / apps.length) * 100 : 0;
                return (
                  <li key={stage} className="flex items-center gap-3">
                    <span className="w-[70px] shrink-0 text-[13px] capitalize text-ink-soft">{stage}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right font-mono text-[12px] text-ink-soft">{count}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
