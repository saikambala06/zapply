"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Trash2, Pin, Loader2, Sparkles, Check, X } from "lucide-react";

type Row = {
  _id: string;
  question: string;
  answer: string;
  inputType?: string;
  options?: string[];
  useCount?: number;
  pinned?: boolean;
  source?: string;
  lastDomain?: string;
};

export default function ResponsesManager({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.question} ${r.answer}`.toLowerCase().includes(q));
  }, [rows, query]);

  async function patch(id: string, body: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...body } : r)));
    await fetch(`/api/responses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function remove(id: string) {
    setRows((rs) => rs.filter((r) => r._id !== id));
    await fetch(`/api/responses/${id}`, { method: "DELETE" });
  }

  async function draftWithAI(row: Row) {
    setBusyId(row._id);
    setError("");
    try {
      const res = await fetch("/api/ai/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: row.question, options: row.options }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEditing(row._id);
      setDraft(json.data.answer);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Answer memory</p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-.02em]">Saved answers</h1>
          <p className="mt-1.5 max-w-[520px] text-[15px] text-ink-soft">
            Every custom question you answer once gets stored here and reused on the next form that asks
            something similar.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" /> Add answer
        </button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          className="input pl-9"
          placeholder="Search your answers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-danger-500/25 bg-danger-500/5 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-[15px] font-semibold">
              {rows.length === 0 ? "No saved answers yet" : "Nothing matches that search"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[360px] text-[14px] text-ink-soft">
              {rows.length === 0
                ? "Answer a custom question on any application with the extension running, and it'll appear here."
                : "Try a different word from the question."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((r) => (
              <li key={r._id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold leading-snug">{r.question}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="chip">{r.inputType ?? "text"}</span>
                      {r.source === "ai" && (
                        <span className="chip border-brand-200 bg-brand-50 text-brand-600">
                          <Sparkles className="h-2.5 w-2.5" /> drafted
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-ink-faint">
                        used {r.useCount ?? 0}×{r.lastDomain ? ` · ${r.lastDomain}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => patch(r._id, { pinned: !r.pinned })}
                      aria-label={r.pinned ? "Unpin answer" : "Pin answer"}
                      className={`rounded-lg p-1.5 transition ${r.pinned ? "text-brand-600" : "text-ink-faint hover:text-ink"}`}
                    >
                      <Pin className={`h-4 w-4 ${r.pinned ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={() => draftWithAI(r)}
                      disabled={busyId === r._id}
                      aria-label="Draft with AI"
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-brand-50 hover:text-brand-600"
                    >
                      {busyId === r._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => remove(r._id)}
                      aria-label="Delete answer"
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-danger-500/10 hover:text-danger-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {editing === r._id ? (
                  <div className="mt-3">
                    <textarea
                      className="input resize-y"
                      rows={4}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          patch(r._id, { answer: draft });
                          setEditing(null);
                        }}
                        className="btn-primary btn-sm"
                      >
                        <Check className="h-3.5 w-3.5" /> Save answer
                      </button>
                      <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditing(r._id); setDraft(r.answer); }}
                    className="mt-2 block w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed text-ink-soft transition hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    {r.answer || <span className="italic text-ink-faint">No answer saved — click to write one</span>}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {adding && (
        <AddAnswer
          onClose={() => setAdding(false)}
          onCreated={(row) => { setRows((rs) => [row, ...rs]); setAdding(false); }}
        />
      )}
    </div>
  );
}

function AddAnswer({ onClose, onCreated }: { onClose: () => void; onCreated: (r: Row) => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    onCreated(json.data);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-[480px] animate-pop rounded-2xl bg-white p-6 shadow-lift">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-ink-faint hover:text-ink" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="font-display text-[20px] font-extrabold">Add a saved answer</h2>
        <p className="mt-1 text-[13.5px] text-ink-soft">Write it the way applications usually phrase it.</p>

        <div className="mt-5 space-y-3.5">
          <div>
            <label className="label">Question</label>
            <input
              className="input"
              required
              value={question}
              placeholder="Why do you want to work here?"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Answer</label>
            <textarea className="input resize-y" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </div>
        </div>

        {error && <p className="mt-3 text-[13px] text-danger-500">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button className="btn-primary flex-1" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save answer
          </button>
        </div>
      </form>
    </div>
  );
}
