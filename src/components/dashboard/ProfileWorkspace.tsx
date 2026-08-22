"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Star, Download, Loader2, X, Copy, Sparkles, FileUp,
} from "lucide-react";
import ProfileEditor from "./ProfileEditor";

type Profile = any;

/**
 * Wraps the editor with everything that operates on *profiles* rather than on
 * the fields inside one: switching, creating, deleting, and JSON export/import.
 */
export default function ProfileWorkspace({
  profiles: initial,
  premium,
}: {
  profiles: Profile[];
  premium: boolean;
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>(initial);
  const [activeId, setActiveId] = useState<string>(
    initial.find((p) => p.isDefault)?._id ?? initial[0]?._id
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Handed to the editor, which switches to Documents and reads it immediately.
  const [pendingResume, setPendingResume] = useState<{ file: File; nonce: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = profiles.find((p) => p._id === activeId) ?? profiles[0];
  const atLimit = profiles.length >= 8;

  /* ---------------- create / delete / default ---------------- */

  async function createProfile(seed?: Partial<Profile>) {
    setBusy("create");
    setError("");
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seed ?? { label: `Profile ${profiles.length + 1}` }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setProfiles((ps) => [...ps, json.data]);
      setActiveId(json.data._id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  /** Copies the current profile — the fastest way to make a role-specific variant. */
  async function duplicateProfile() {
    const { _id, createdAt, updatedAt, documents, isDefault, ...rest } = active;
    await createProfile({ ...rest, label: `${active.label} (copy)` });
  }

  async function deleteProfile() {
    setBusy("delete");
    try {
      const res = await fetch(`/api/profiles/${active._id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const remaining = profiles.filter((p) => p._id !== active._id);
      setProfiles(remaining);
      setActiveId(remaining[0]?._id);
      setConfirmDelete(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function makeDefault() {
    setBusy("default");
    await fetch(`/api/profiles/${active._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    setProfiles((ps) => ps.map((p) => ({ ...p, isDefault: p._id === active._id })));
    setBusy(null);
    router.refresh();
  }

  /* ---------------- export / import ---------------- */

  function exportProfile() {
    // Documents are omitted — a base64 resume would bloat the file and the
    // point of an export is portability, not backup of binaries.
    const { _id, userId, documents, createdAt, updatedAt, __v, ...rest } = active;
    const blob = new Blob([JSON.stringify({ zapplyProfile: 1, ...rest }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(active.label || "zapply-profile").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Picking a resume here does the whole job in one step: jump to Documents and
   * start reading it. The old flow made you find the tab and pick the file again.
   */
  function onResumePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    // The nonce makes a repeat upload of the same file still trigger the effect.
    setPendingResume({ file, nonce: Date.now() });
  }

  /* ---------------- render ---------------- */

  return (
    <div className="space-y-5">
      {/* Profile bar */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {profiles.map((p) => (
              <button
                key={p._id}
                onClick={() => setActiveId(p._id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  p._id === activeId
                    ? "bg-brand-500 text-white"
                    : "border border-line bg-white text-ink-soft hover:border-brand-200"
                }`}
              >
                {p.isDefault && (
                  <Star
                    className={`h-3 w-3 ${p._id === activeId ? "fill-white" : "fill-amber-400 text-amber-400"}`}
                  />
                )}
                <span className="max-w-[150px] truncate">{p.label || "Untitled"}</span>
                <span className={`font-mono text-[10px] ${p._id === activeId ? "text-white/70" : "text-ink-faint"}`}>
                  {p.completeness ?? 0}%
                </span>
              </button>
            ))}

            <button
              onClick={() => createProfile()}
              disabled={busy !== null || atLimit || (!premium && profiles.length >= 1)}
              title={
                atLimit
                  ? "You've reached 8 profiles"
                  : !premium && profiles.length >= 1
                  ? "Multiple profiles are a Premium feature"
                  : "Add a profile"
              }
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-40"
            >
              {busy === "create" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              New
              {!premium && profiles.length >= 1 && (
                <Sparkles className="h-3 w-3 text-amber-500" />
              )}
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!active?.isDefault && profiles.length > 1 && (
              <button onClick={makeDefault} className="btn-ghost btn-sm" disabled={busy !== null}>
                <Star className="h-3.5 w-3.5" /> Make default
              </button>
            )}
            <button onClick={duplicateProfile} className="btn-ghost btn-sm" disabled={busy !== null} title="Duplicate this profile">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="btn-primary btn-sm"
              title="Read a resume and fill this profile"
            >
              <FileUp className="h-3.5 w-3.5" />
              Upload resume
            </button>
            <button onClick={exportProfile} className="btn-ghost btn-sm" title="Export as JSON">
              <Download className="h-3.5 w-3.5" />
            </button>
            {profiles.length > 1 && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg p-1.5 text-ink-faint transition hover:bg-danger-500/10 hover:text-danger-500"
                title="Delete this profile"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {!premium && profiles.length >= 1 && (
          <p className="mt-2.5 border-t border-line pt-2.5 text-[12.5px] text-ink-soft">
            One profile on the free plan. Premium lets you keep a separate profile — and resume — per
            role, and scores each posting against them.
          </p>
        )}

        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={onResumePicked} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-danger-500/25 bg-danger-500/5 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </p>
      )}

      {/* The editor itself. Remounting on switch resets its internal draft state. */}
      {active && (
        <ProfileEditor
          key={active._id}
          initial={active}
          premium={premium}
          pendingResume={pendingResume}
          onResumeConsumed={() => setPendingResume(null)}
          onSaved={(saved) => setProfiles((ps) => ps.map((p) => (p._id === saved._id ? saved : p)))}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Dialog onClose={() => setConfirmDelete(false)} title={`Delete "${active.label}"?`}>
          <p className="text-[14px] leading-relaxed text-ink-soft">
            This removes the profile and everything in it, including uploaded documents. Applications
            you already tracked stay put.
          </p>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost flex-1">Keep it</button>
            <button onClick={deleteProfile} className="btn flex-1 bg-danger-500 text-white hover:bg-danger-600" disabled={busy !== null}>
              {busy === "delete" && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete profile
            </button>
          </div>
        </Dialog>
      )}

    </div>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[440px] animate-pop rounded-2xl bg-white p-6 shadow-lift">
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-faint hover:text-ink" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="font-display text-[19px] font-extrabold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
