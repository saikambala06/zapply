"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check } from "lucide-react";

type Settings = Record<string, any>;

function Toggle({
  label, description, checked, onChange, disabled = false,
}: {
  label: string; description: React.ReactNode; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-6 py-4 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold">{label}</span>
        <span className="mt-0.5 block text-[13.5px] leading-relaxed text-ink-soft">{description}</span>
      </span>
      <span className="relative mt-1 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="block h-6 w-11 rounded-full bg-line transition peer-checked:bg-brand-500 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function SettingsPanel({
  initial, email, premium = false,
}: { initial: Settings; email: string; premium?: boolean }) {
  const [s, setS] = useState<Settings>({
    autofillOnLoad: true, autoPilot: false, showOverlay: true, trackAutomatically: true,
    reuseSavedResponses: true, aiAnswers: false, fillDelayMs: 120, dailyGoal: 10,
    excludedDomains: [], ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /**
   * Toggles save at once; sliders and number inputs are debounced, because
   * dragging the delay slider previously fired one request per pixel moved.
   */
  async function save(next: Settings, debounceMs = 0) {
    setS(next);
    if (timer.current) clearTimeout(timer.current);

    const run = async () => {
      setSaving(true);
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setError("");
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } catch (e: any) {
        setError(e.message || "Couldn't save that setting.");
      } finally {
        setSaving(false);
      }
    };

    if (debounceMs) timer.current = setTimeout(run, debounceMs);
    else await run();
  }

  const set = (k: string) => (v: any) => save({ ...s, [k]: v });
  const setSlow = (k: string) => (v: any) => save({ ...s, [k]: v }, 500);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-.02em]">Autofill behaviour</h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            Changes reach the extension within a minute, or straight away if you hit
          Sync now in the popup.
          </p>
        </div>
        <span className="font-mono text-[12px] text-ink-faint">
          {saving ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : saved ? <><Check className="inline h-3.5 w-3.5 text-teal-600" /> saved</> : email}
        </span>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-danger-500/25 bg-danger-500/5 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </p>
      )}

      <section className="card px-5 sm:px-6">
        <div className="divide-y divide-line">
          <Toggle
            label="Fill as soon as a form loads"
            description="Zapply fills the moment it recognises an application. Turn this off to fill only when you click the extension."
            checked={s.autofillOnLoad}
            onChange={set("autofillOnLoad")}
          />
          <Toggle
            label="Auto Pilot"
            description="Fill, advance through multi-step forms, and submit without stopping. Off by default — review before you submit unless you're sure."
            checked={s.autoPilot}
            onChange={set("autoPilot")}
          />
          <Toggle
            label="Show the status pill"
            description="A small indicator on the page showing how many fields were filled and what it skipped."
            checked={s.showOverlay}
            onChange={set("showOverlay")}
          />
          <Toggle
            label="Track applications automatically"
            description="Log the role, company and link to your tracker when you submit."
            checked={s.trackAutomatically}
            onChange={set("trackAutomatically")}
          />
          <Toggle
            label="Reuse saved answers"
            description="Match custom questions against answers you've already written, even when the wording differs."
            checked={s.reuseSavedResponses}
            onChange={set("reuseSavedResponses")}
          />
          <Toggle
            label="Answer remaining questions with AI"
            description={
              premium
                ? "When no saved answer matches, Zapply writes one from your profile — including dropdowns and multiple choice. Drafts are outlined so you review them before submitting."
                : "Premium. Zapply writes the questions your profile can't answer, dropdowns included."
            }
            checked={premium && s.aiAnswers}
            disabled={!premium}
            onChange={set("aiAnswers")}
          />
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-bold">Pace</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Daily application goal</label>
            <input
              type="number"
              min={1}
              max={100}
              className="input"
              value={s.dailyGoal}
              onChange={(e) => setSlow("dailyGoal")(Number(e.target.value))}
            />
            <p className="mt-1 font-mono text-[10.5px] text-ink-faint">Drives the goal line on your overview</p>
          </div>
          <div>
            <label className="label">Typing delay between fields</label>
            <input
              type="range"
              min={0}
              max={600}
              step={20}
              className="w-full accent-brand-500"
              value={s.fillDelayMs}
              onChange={(e) => setSlow("fillDelayMs")(Number(e.target.value))}
            />
            <p className="mt-1 font-mono text-[10.5px] text-ink-faint">
              {s.fillDelayMs}ms — raise it if a site's dropdowns don't keep up
            </p>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-bold">Skip these sites</h2>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          One domain per line. Zapply won&apos;t touch forms on these.
        </p>
        <textarea
          className="input mt-4 resize-y font-mono text-[13px]"
          rows={4}
          placeholder={"internal.mycompany.com\nexample.org"}
          value={(s.excludedDomains ?? []).join("\n")}
          onChange={(e) => setS({ ...s, excludedDomains: e.target.value.split("\n") })}
          onBlur={(e) =>
            save({ ...s, excludedDomains: e.target.value.split("\n").map((d) => d.trim()).filter(Boolean) })
          }
        />
      </section>
    </div>
  );
}
