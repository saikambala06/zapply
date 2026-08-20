"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Zap } from "lucide-react";

/**
 * The signature element: a mock application form filling itself, field by field,
 * with the source of each value called out on the left. This is the product's
 * whole promise in one frame, so it leads the page.
 */

type Field = { label: string; value: string; source: string; kind?: "text" | "select" | "file" | "long" };

const FIELDS: Field[] = [
  { label: "First name", value: "Aarav", source: "Profile" },
  { label: "Last name", value: "Mehta", source: "Profile" },
  { label: "Email", value: "aarav.mehta@gmail.com", source: "Profile" },
  { label: "Phone", value: "+1 (415) 555-0142", source: "Profile" },
  { label: "Location", value: "San Francisco, CA", source: "Profile" },
  { label: "Resume", value: "aarav-mehta-resume.pdf", source: "Documents", kind: "file" },
  { label: "LinkedIn", value: "linkedin.com/in/aaravmehta", source: "Links" },
  { label: "Current company", value: "Stripe", source: "Work history" },
  { label: "Years of experience", value: "5–7 years", source: "Work history", kind: "select" },
  { label: "Authorized to work in the US?", value: "Yes", source: "Work eligibility", kind: "select" },
  { label: "Require sponsorship?", value: "No", source: "Work eligibility", kind: "select" },
  { label: "Desired salary", value: "$185,000", source: "Compensation" },
  { label: "Why do you want to work here?", value: "I've followed the payments team since…", source: "Saved answers", kind: "long" },
  { label: "Gender", value: "Prefer not to say", source: "EEO" },
  { label: "Veteran status", value: "I am not a protected veteran", source: "EEO", kind: "select" },
  { label: "Start date", value: "2026-09-14", source: "Availability" },
];

export default function AutofillDemo() {
  const [filled, setFilled] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    if (timer.current) clearInterval(timer.current);
    setFilled(0);
    setRunning(true);
    timer.current = setInterval(() => {
      setFilled((n) => {
        if (n >= FIELDS.length) {
          if (timer.current) clearInterval(timer.current);
          setRunning(false);
          return n;
        }
        return n + 1;
      });
    }, 190);
  };

  useEffect(() => {
    const t = setTimeout(start, 550);
    return () => {
      clearTimeout(t);
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = filled >= FIELDS.length;

  return (
    <div className="relative">
      {/* Browser chrome */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
        <div className="flex items-center gap-3 border-b border-line bg-[#FBFBFD] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          <div className="flex-1 truncate rounded-lg border border-line bg-white px-3 py-1 font-mono text-[11px] text-ink-faint">
            boards.greenhouse.io/northwind/jobs/4821 — Senior Product Engineer
          </div>
          <span className="hidden sm:inline chip border-brand-200 bg-brand-50 text-brand-600">Greenhouse</span>
        </div>

        <div className="grid md:grid-cols-[190px_1fr]">
          {/* Source column */}
          <aside className="hidden border-r border-line bg-[#FBFAFE] p-4 md:block">
            <p className="eyebrow mb-3">Pulled from</p>
            <ul className="space-y-2">
              {Array.from(new Set(FIELDS.map((f) => f.source))).map((source) => {
                const active = FIELDS.slice(0, filled).some((f) => f.source === source);
                return (
                  <li
                    key={source}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition-all duration-300 ${
                      active
                        ? "border-brand-200 bg-white text-brand-700 shadow-sm"
                        : "border-transparent bg-transparent text-ink-faint"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition ${active ? "bg-teal-500" : "bg-line"}`}
                    />
                    {source}
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* The form */}
          <div className="relative max-h-[420px] overflow-hidden p-4 sm:p-5">
            {running && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 animate-scanline bg-gradient-to-b from-brand-500/0 via-brand-500/[.07] to-brand-500/0" />
            )}

            <div className="grid gap-2.5 sm:grid-cols-2">
              {FIELDS.map((f, i) => {
                const isFilled = i < filled;
                const isActive = i === filled - 1 && running;
                return (
                  <div
                    key={f.label}
                    className={`${f.kind === "long" ? "sm:col-span-2" : ""} rounded-xl border px-3 py-2 transition-all duration-200 ${
                      isActive
                        ? "border-brand-400 bg-brand-50 shadow-ring"
                        : isFilled
                        ? "border-teal-500/30 bg-white"
                        : "border-line bg-[#FCFCFD]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium text-ink-soft">{f.label}</span>
                      {isFilled && <Check className="h-3 w-3 shrink-0 text-teal-600" strokeWidth={3} />}
                    </div>
                    <div
                      className={`mt-0.5 truncate text-[13px] ${
                        isFilled ? "text-ink" : "text-transparent"
                      } ${f.kind === "file" && isFilled ? "font-mono text-[11px] text-brand-600" : ""}`}
                    >
                      {isFilled ? f.value : "\u00A0"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Status pill — mirrors what the extension shows on a real page */}
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-white px-4 py-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              done ? "bg-teal-500/10 text-teal-600" : "bg-brand-50 text-brand-600"
            }`}
          >
            {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Zap className="h-3.5 w-3.5 animate-pulseDot" />}
            {done ? "Application ready to submit" : "Filling fields…"}
          </span>
          <span className="font-mono text-[12px] text-ink-soft">
            {filled}/{FIELDS.length} fields
          </span>
          <div className="h-1.5 flex-1 min-w-[80px] overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-500 transition-all duration-200"
              style={{ width: `${(filled / FIELDS.length) * 100}%` }}
            />
          </div>
          <button onClick={start} className="btn-ghost btn-sm" aria-label="Replay the autofill demo">
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}
