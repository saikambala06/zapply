"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Trash2, ExternalLink, X, Loader2, StickyNote, Star, ChevronDown } from "lucide-react";
import { relativeDate, formatDate } from "@/lib/utils";

const STAGES = ["saved", "applied", "screen", "interview", "offer", "rejected", "ghosted"] as const;
type Stage = (typeof STAGES)[number];

const TONE: Record<string, string> = {
  saved: "bg-canvas text-ink-soft border-line",
  applied: "bg-brand-50 text-brand-600 border-brand-100",
  screen: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  interview: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  offer: "bg-teal-500/20 text-teal-600 border-teal-500/30",
  rejected: "bg-danger-500/10 text-danger-500 border-danger-500/20",
  ghosted: "bg-canvas text-ink-faint border-line",
};

export default function ApplicationTable({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesStage = stage === "all" || r.stage === stage;
      const matchesQuery =
        !q ||
        [r.jobTitle, r.company, r.location, r.ats].filter(Boolean).join(" ").toLowerCase().includes(q);
      return matchesStage && matchesQuery;
    });
  }, [rows, query, stage]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => (c[r.stage] = (c[r.stage] ?? 0) + 1));
    return c;
  }, [rows]);

  async function updateStage(id: string, next: Stage) {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, stage: next } : r)));
    await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next }),
    });
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...body } : r)));
    await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function remove(id: string) {
    setRows((rs) => rs.filter((r) => r._id !== id));
    await fetch(`/api/applications/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Tracker</p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-.02em]">Applications</h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            The extension files these automatically. Move a stage as you hear back.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" /> Add manually
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            className="input pl-9"
            placeholder="Search role, company or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...STAGES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium capitalize transition ${
                stage === s ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-ink-soft hover:border-brand-200"
              }`}
            >
              {s} <span className="font-mono text-[11px] opacity-70">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[15px] font-semibold">
              {rows.length === 0 ? "Nothing tracked yet" : "No applications match that filter"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[340px] text-[14px] text-ink-soft">
              {rows.length === 0
                ? "Submit an application with the extension running and it lands here on its own."
                : "Clear the search or pick a different stage."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((r) => (
              <li key={r._id}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <button
                  onClick={() => patch(r._id, { favorite: !r.favorite })}
                  aria-label={r.favorite ? "Remove from favourites" : "Mark as favourite"}
                  className="shrink-0"
                >
                  <Star className={`h-4 w-4 transition ${r.favorite ? "fill-amber-400 text-amber-400" : "text-line hover:text-ink-faint"}`} />
                </button>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas font-display text-[13px] font-bold text-ink-soft">
                  {(r.company ?? r.jobTitle ?? "?")[0]?.toUpperCase()}
                </span>

                <div className="min-w-0 flex-1 basis-[200px]">
                  <p className="truncate text-[14px] font-medium">{r.jobTitle}</p>
                  <p className="truncate font-mono text-[11px] text-ink-faint">
                    {[r.company, r.location].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>

                {r.ats && <span className="hidden chip sm:inline-flex">{r.ats}</span>}

                <span className="hidden w-[86px] shrink-0 font-mono text-[11px] text-ink-faint md:block">
                  {relativeDate(r.appliedAt)}
                </span>

                <select
                  value={r.stage}
                  onChange={(e) => updateStage(r._id, e.target.value as Stage)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold capitalize outline-none ${TONE[r.stage]}`}
                  aria-label={`Stage for ${r.jobTitle}`}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setExpanded(expanded === r._id ? null : r._id)}
                    aria-expanded={expanded === r._id}
                    className={`rounded-lg p-1.5 transition hover:bg-canvas ${
                      r.notes ? "text-brand-600" : "text-ink-faint hover:text-ink"
                    }`}
                    aria-label="Notes and history"
                  >
                    <StickyNote className="h-4 w-4" />
                  </button>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-canvas hover:text-brand-600"
                      aria-label="Open job posting"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    onClick={() => remove(r._id)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-danger-500/10 hover:text-danger-500"
                    aria-label="Delete application"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {expanded === r._id && <RowDetail row={r} onSave={(notes) => patch(r._id, { notes })} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onCreated={(row) => {
            setRows((rs) => [row, ...rs]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

/** Notes plus the stage history the API stamps on every change. */
function RowDetail({ row, onSave }: { row: any; onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saved, setSaved] = useState(false);
  const dirty = notes !== (row.notes ?? "");

  return (
    <div className="animate-pop border-t border-line bg-canvas px-4 py-4 sm:px-5">
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div>
          <label className="label" htmlFor={`notes-${row._id}`}>Notes</label>
          <textarea
            id={`notes-${row._id}`}
            className="input resize-y bg-white"
            rows={4}
            value={notes}
            placeholder="Recruiter name, referral, interview prep, salary discussed…"
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => { onSave(notes); setSaved(true); }}
              className="btn-primary btn-sm"
              disabled={!dirty}
            >
              {saved && !dirty ? "Saved" : "Save notes"}
            </button>
            {row.ats && <span className="chip">{row.ats}</span>}
            {row.autofill?.fieldsFilled != null && (
              <span className="font-mono text-[11px] text-ink-faint">
                {row.autofill.fieldsFilled} fields autofilled
              </span>
            )}
          </div>
        </div>

        <div>
          <p className="label">History</p>
          <ol className="space-y-2">
            {(row.events?.length ? row.events : [{ stage: row.stage, at: row.appliedAt }]).map(
              (ev: any, i: number) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                  <span className="text-[13px] capitalize text-ink">{ev.stage}</span>
                  <span className="ml-auto font-mono text-[11px] text-ink-faint">
                    {formatDate(ev.at)}
                  </span>
                </li>
              )
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}

function AddDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (row: any) => void }) {
  const [form, setForm] = useState({ jobTitle: "", company: "", location: "", url: "", stage: "applied" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, source: "manual" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    onCreated(json.data);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-[440px] animate-pop rounded-2xl bg-white p-6 shadow-lift">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-ink-faint hover:text-ink" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="font-display text-[20px] font-extrabold">Add an application</h2>
        <p className="mt-1 text-[13.5px] text-ink-soft">For anything you applied to outside the extension.</p>

        <div className="mt-5 space-y-3.5">
          <div>
            <label className="label">Job title</label>
            <input className="input" required value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label className="label">Company</label>
              <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Job link</label>
            <input className="input" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <div>
            <label className="label">Stage</label>
            <select className="input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-[13px] text-danger-500">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button className="btn-primary flex-1" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add application
          </button>
        </div>
      </form>
    </div>
  );
}
