"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, Loader2, Layers, Gauge, PenLine } from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "Multiple profiles",
    body: "Keep a separate profile per track — different resume, different summary, different target role — and switch per application.",
  },
  {
    icon: Gauge,
    title: "Profile scoring",
    body: "Zapply reads the posting, scores each of your profiles against it, and fills with the one that fits best.",
  },
  {
    icon: PenLine,
    title: "Generated answers",
    body: "Custom questions drafted from your own work history. Nothing is invented — you review before it's saved.",
  },
];

export default function PremiumPanel({
  premium, trialUsed, trialDaysLeft,
}: { premium: boolean; trialUsed: boolean; trialDaysLeft: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"trial" | "checkout" | null>(null);
  const [error, setError] = useState("");

  async function startTrial() {
    setBusy("trial");
    const res = await fetch("/api/billing/trial", { method: "POST" });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) return setError(json.error);
    router.refresh();
  }

  /**
   * Subscribers go to the billing portal; everyone else goes to checkout.
   * Sending an existing subscriber to checkout would start a second
   * subscription and bill them twice.
   */
  async function manageOrSubscribe() {
    setBusy("checkout");
    const endpoint = premium ? "/api/billing/portal" : "/api/billing/checkout";
    const res = await fetch(endpoint, { method: "POST" });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) return setError(json.error);
    if (json.data.url) window.location.href = json.data.url;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Premium</p>
        <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-.02em]">
          {premium ? "Premium is on" : "Apply fast without applying blind"}
        </h1>
        <p className="mt-1.5 max-w-[540px] text-[15px] text-ink-soft">
          {premium
            ? trialDaysLeft > 0
              ? `Your trial has ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left. Subscribe any time to keep these features.`
              : "Multiple profiles, scoring and generated answers are active on your account."
            : "Volume gets you interviews. Fit gets you offers. Premium keeps both."}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-danger-500/25 bg-danger-500/5 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-500">
              <f.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-[16px] font-bold">{f.title}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{f.body}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl bg-brand-900 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-400">
              <Sparkles className="h-3 w-3" /> Premium
            </span>
            <p className="mt-4 font-display text-[38px] font-extrabold leading-none">
              $9<span className="text-[16px] font-semibold text-brand-100/60">/month</span>
            </p>
            <ul className="mt-5 space-y-2">
              {["Up to 8 profiles", "Scoring on every posting", "Generated answers", "Cancel anytime"].map((l) => (
                <li key={l} className="flex items-center gap-2 text-[14px] text-brand-100/80">
                  <Check className="h-3.5 w-3.5 text-teal-400" strokeWidth={3} />
                  {l}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            {!premium && !trialUsed && (
              <button onClick={startTrial} className="btn bg-white px-5 py-3 text-brand-900 hover:bg-brand-50" disabled={busy !== null}>
                {busy === "trial" && <Loader2 className="h-4 w-4 animate-spin" />}
                Start 3-day free trial
              </button>
            )}
            <button
              onClick={manageOrSubscribe}
              className={`btn px-5 py-3 ${premium || trialUsed ? "bg-white text-brand-900 hover:bg-brand-50" : "border border-white/20 text-white hover:bg-white/10"}`}
              disabled={busy !== null}
            >
              {busy === "checkout" && <Loader2 className="h-4 w-4 animate-spin" />}
              {premium ? "Manage subscription" : "Subscribe now"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
