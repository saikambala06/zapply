"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  User, Link2, Briefcase, GraduationCap, Wrench, FileText, ShieldCheck,
  Banknote, Users, Plus, Trash2, Loader2, Check, Upload, Sparkles, X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Field({
  label, value, onChange, placeholder, type = "text", hint, className = "",
}: {
  label: string; value?: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="mt-1 font-mono text-[10.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}

function Select({
  label, value, onChange, options, className = "",
}: {
  label: string; value?: string; onChange: (v: string) => void;
  options: string[]; className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function TextArea({
  label, value, onChange, placeholder, rows = 4,
}: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input resize-y"
        rows={rows}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TagInput({ label, tags, onChange, placeholder }: {
  label: string; tags: string[]; onChange: (t: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-white p-2">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-[13px] text-brand-700">
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[140px] flex-1 bg-transparent px-1.5 py-1 text-[14px] outline-none placeholder:text-ink-faint"
          value={draft}
          placeholder={placeholder ?? "Type and press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={add}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "personal", label: "Personal", icon: User },
  { id: "links", label: "Links", icon: Link2 },
  { id: "experience", label: "Work history", icon: Briefcase },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "eligibility", label: "Work eligibility", icon: ShieldCheck },
  { id: "compensation", label: "Compensation", icon: Banknote },
  { id: "eeo", label: "EEO", icon: Users },
] as const;

const YESNO = ["Yes", "No"];

export default function ProfileEditor({
  initial,
  premium = false,
  pendingResume = null,
  onResumeConsumed,
  onSaved,
}: {
  initial: any;
  premium?: boolean;
  pendingResume?: { file: File; nonce: number } | null;
  onResumeConsumed?: () => void;
  onSaved?: (profile: any) => void;
}) {
  const [p, setP] = useState<any>(initial);
  const [section, setSection] = useState<string>("personal");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<any>(null);

  // A resume picked from the toolbar above: show the Documents tab so the user
  // sees what's happening, then read it without a second file prompt.
  const lastResumeNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingResume || lastResumeNonce.current === pendingResume.nonce) return;
    lastResumeNonce.current = pendingResume.nonce;
    setSection("documents");
    readResume(pendingResume.file, { alsoAttach: true });
    onResumeConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume]);

  const setPath = (path: string, value: any) =>
    setP((prev: any) => {
      const [head, tail] = path.split(".");
      if (tail) return { ...prev, [head]: { ...(prev[head] ?? {}), [tail]: value } };
      return { ...prev, [head]: value };
    });

  const completeness = useMemo(() => {
    const checks = [
      p.personal?.firstName, p.personal?.lastName, p.personal?.email, p.personal?.phone,
      p.personal?.city, p.personal?.country, p.education?.length, p.experience?.length,
      p.skills?.length, p.websites?.length, p.documents?.some((d: any) => d.kind === "resume"),
      p.workAuth?.authorizedToWork, p.eeo?.gender || p.eeo?.declineToSelfIdentify, p.summary,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [p]);

  const save = () => saveProfile(p);

  async function saveProfile(profile: any) {
    setSaving(true);
    setError("");
    try {
      // Send only the editable sections. Posting the whole document back sent
      // megabytes of base64 resume over the wire and let the server overwrite
      // its own file data with the browser's slimmed-down copy.
      const payload = {
        label: profile.label, targetRole: profile.targetRole, color: profile.color,
        summary: profile.summary, personal: profile.personal, workAuth: profile.workAuth,
        compensation: profile.compensation, eeo: profile.eeo,
        skills: profile.skills, certifications: profile.certifications,
        websites: profile.websites, experience: profile.experience, education: profile.education,
      };

      const res = await fetch(`/api/profiles/${profile._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save your changes.");
      // The response omits `documents` by design, so preserve local state.
      const merged = { ...json.data, documents: profile.documents ?? [] };
      setP(merged);
      onSaved?.(merged);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Sends the resume to the server, which extracts the text, runs it through
   * the AI provider, and returns structured sections. Nothing is written until
   * the user accepts the result.
   */
  async function readResume(file: File, { alsoAttach = false } = {}) {
    setParsing(true);
    setError("");
    try {
      // Uploading from the toolbar should also store the file, so it gets
      // attached to applications that ask for one — not just read and discarded.
      if (alsoAttach) {
        const attached = await uploadResume(file);
        if (!attached) throw new Error("The resume was parsed but could not be saved to your profile. Please retry the upload.");
      }

      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/parse-resume", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setParsed(json.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  }

  /** Merges parsed sections in, keeping anything the user already filled in. */
  async function acceptParsed(sections: Record<string, boolean>) {
    const prev = p;
    const next = { ...prev, personal: { ...(prev.personal ?? {}) } };
    if (sections.personal && parsed.personal) {
      next.personal = { ...prev.personal };
      for (const [k, v] of Object.entries(parsed.personal)) {
        if (v && !next.personal[k]) next.personal[k] = v;
      }
    }
    if (sections.experience && parsed.experience?.length) next.experience = parsed.experience;
    if (sections.education && parsed.education?.length) next.education = parsed.education;
    if (sections.skills && parsed.skills?.length) {
      next.skills = Array.from(new Set([...(prev.skills ?? []), ...parsed.skills]));
    }
    if (sections.websites && parsed.websites?.length) {
      const have = new Set((prev.websites ?? []).map((w: any) => w.url));
      next.websites = [...(prev.websites ?? []), ...parsed.websites.filter((w: any) => w.url && !have.has(w.url))];
    }
    if (sections.summary && parsed.summary) next.summary = parsed.summary;
    if (sections.skills && parsed.targetRole && !prev.targetRole) next.targetRole = parsed.targetRole;
    if (sections.workAuth && parsed.workAuth) {
      next.workAuth = { ...(prev.workAuth ?? {}) };
      for (const [k, v] of Object.entries(parsed.workAuth)) if (v && !next.workAuth[k]) next.workAuth[k] = v;
    }
    if (sections.compensation && parsed.compensation) {
      next.compensation = { ...(prev.compensation ?? {}) };
      for (const [k, v] of Object.entries(parsed.compensation)) if (v && !next.compensation[k]) next.compensation[k] = v;
    }
    if (sections.eeo && parsed.eeo) {
      next.eeo = { ...(prev.eeo ?? {}) };
      for (const [k, v] of Object.entries(parsed.eeo)) if (v && !next.eeo[k]) next.eeo[k] = v;
    }

    // Persist only after the complete merged object exists. The old implementation
    // performed a network side-effect inside a React state updater, which could
    // race under concurrent rendering and save the previous draft.
    setP(next);
    const ok = await saveProfile(next);
    if (ok) setParsed(null);
  }

  /** Documents live outside the PATCH payload, so they need their own call. */
  async function deleteDocument(documentId: string) {
    setP((prev: any) => ({ ...prev, documents: prev.documents.filter((d: any) => d._id !== documentId) }));
    await fetch("/api/resume/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: p._id, documentId }),
    });
  }

  async function uploadResume(file: File, kind = "resume") {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("profileId", p._id);
      fd.append("kind", kind);
      const res = await fetch("/api/resume/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || "The resume could not be saved."); return false; }
      setP((prev: any) => ({
        ...prev,
        documents: [...(prev.documents ?? []), { ...json.data, _id: json.data.id }],
      }));
      return true;
    } catch (e: any) {
      setError(e?.message || "The resume upload failed.");
      return false;
    }
  }

  const addRow = (key: string, blank: any) =>
    setP((prev: any) => ({ ...prev, [key]: [...(prev[key] ?? []), blank] }));
  const updateRow = (key: string, i: number, patch: any) =>
    setP((prev: any) => ({
      ...prev,
      [key]: prev[key].map((r: any, idx: number) => (idx === i ? { ...r, ...patch } : r)),
    }));
  const removeRow = (key: string, i: number) =>
    setP((prev: any) => ({ ...prev, [key]: prev[key].filter((_: any, idx: number) => idx !== i) }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Profile</p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-.02em]">
            {p.label || "Your profile"}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            Everything here is what the extension types into application forms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <p className="text-right font-mono text-[11px] text-ink-faint">{completeness}% complete</p>
            <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${completeness}%` }} />
            </div>
          </div>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-danger-500/25 bg-danger-500/5 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[190px_1fr]">
        {/* Section rail */}
        <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible scroll-thin">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition ${
                section === s.id ? "bg-brand-500 text-white shadow-sm" : "text-ink-soft hover:bg-white"
              }`}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="card p-5 sm:p-6">
          {/* ---------------- Personal ---------------- */}
          {section === "personal" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="First name" value={p.personal?.firstName} onChange={(v) => setPath("personal.firstName", v)} placeholder="Aarav" />
                <Field label="Middle name" value={p.personal?.middleName} onChange={(v) => setPath("personal.middleName", v)} />
                <Field label="Last name" value={p.personal?.lastName} onChange={(v) => setPath("personal.lastName", v)} placeholder="Mehta" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Preferred name" value={p.personal?.preferredName} onChange={(v) => setPath("personal.preferredName", v)} hint="Used when a form asks for a preferred or nickname" />
                <Field label="Pronouns" value={p.personal?.pronouns} onChange={(v) => setPath("personal.pronouns", v)} placeholder="he/him" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Email" type="email" value={p.personal?.email} onChange={(v) => setPath("personal.email", v)} />
                <Select label="Phone type" value={p.personal?.phoneType} onChange={(v) => setPath("personal.phoneType", v)}
                  options={["Mobile", "Home", "Personal", "Work"]} />
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <Field label="Code" value={p.personal?.phoneCountryCode} onChange={(v) => setPath("personal.phoneCountryCode", v)} placeholder="+1" />
                  <Field label="Phone" value={p.personal?.phone} onChange={(v) => setPath("personal.phone", v)} placeholder="415 555 0142" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date of birth" type="date" value={p.personal?.dateOfBirth} onChange={(v) => setPath("personal.dateOfBirth", v)} />
                <Field label="Nationality / citizenship" value={p.personal?.nationality} onChange={(v) => setPath("personal.nationality", v)} />
              </div>
              <Field label="Street address" value={p.personal?.address} onChange={(v) => setPath("personal.address", v)} />
              <Field label="Address line 2" value={p.personal?.addressLine2} onChange={(v) => setPath("personal.addressLine2", v)} />
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="City" value={p.personal?.city} onChange={(v) => setPath("personal.city", v)} />
                <Field label="State / region" value={p.personal?.state} onChange={(v) => setPath("personal.state", v)} />
                <Field label="Postal code" value={p.personal?.zip} onChange={(v) => setPath("personal.zip", v)} />
                <Field label="Country" value={p.personal?.country} onChange={(v) => setPath("personal.country", v)} />
              </div>
              <TagInput label="Languages" tags={p.personal?.languages ?? []} onChange={(t) => setPath("personal.languages", t)} placeholder="English, Hindi…" />
              <TextArea
                label="Short summary"
                value={p.summary}
                onChange={(v) => setPath("summary", v)}
                placeholder="Two or three sentences on what you do. Premium uses this when drafting answers."
              />
            </div>
          )}

          {/* ---------------- Links ---------------- */}
          {section === "links" && (
            <div className="space-y-4">
              {(p.websites ?? []).map((w: any, i: number) => (
                <div key={i} className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                  <Select label="Type" value={w.label} onChange={(v) => updateRow("websites", i, { label: v })}
                    options={["LinkedIn", "GitHub", "Portfolio", "Personal website", "Twitter/X", "Dribbble", "Behance", "Other"]} />
                  <Field label="URL" value={w.url} onChange={(v) => updateRow("websites", i, { url: v })} placeholder="https://" />
                  <button onClick={() => removeRow("websites", i)} className="btn-danger btn-sm mt-[26px] h-[42px]" aria-label="Remove link">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => addRow("websites", { label: "LinkedIn", url: "" })} className="btn-ghost btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add link
              </button>
            </div>
          )}

          {/* ---------------- Experience ---------------- */}
          {section === "experience" && (
            <div className="space-y-5">
              {(p.experience ?? []).map((x: any, i: number) => (
                <div key={i} className="rounded-xl border border-line p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="chip">Role {i + 1}</span>
                    <button onClick={() => removeRow("experience", i)} className="text-danger-500 hover:opacity-70" aria-label="Remove role">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Job title" value={x.title} onChange={(v) => updateRow("experience", i, { title: v })} />
                    <Field label="Company" value={x.company} onChange={(v) => updateRow("experience", i, { company: v })} />
                    <Select label="Employment type" value={x.employmentType} onChange={(v) => updateRow("experience", i, { employmentType: v })}
                      options={["Full-time", "Part-time", "Internship", "Contract", "Freelance", "Co-op"]} />
                    <Field label="Location" value={x.location} onChange={(v) => updateRow("experience", i, { location: v })} />
                    <Select label="Work location type" value={x.locationType} onChange={(v) => updateRow("experience", i, { locationType: v })}
                      options={["On-site", "Remote", "Hybrid"]} />
                    <Field label="Start" type="month" value={x.startDate} onChange={(v) => updateRow("experience", i, { startDate: v })} />
                    <div>
                      <Field label="End" type="month" value={x.endDate} onChange={(v) => updateRow("experience", i, { endDate: v })} />
                      <label className="mt-2 flex items-center gap-2 text-[13px] text-ink-soft">
                        <input type="checkbox" checked={!!x.current} onChange={(e) => updateRow("experience", i, { current: e.target.checked })} />
                        I currently work here
                      </label>
                    </div>
                  </div>
                  <div className="mt-4">
                    <TextArea label="What you did" value={x.description} onChange={(v) => updateRow("experience", i, { description: v })} rows={3} />
                  </div>
                </div>
              ))}
              <button onClick={() => addRow("experience", { title: "", company: "", current: false })} className="btn-ghost btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add role
              </button>
            </div>
          )}

          {/* ---------------- Education ---------------- */}
          {section === "education" && (
            <div className="space-y-5">
              {(p.education ?? []).map((e: any, i: number) => (
                <div key={i} className="rounded-xl border border-line p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="chip">School {i + 1}</span>
                    <button onClick={() => removeRow("education", i)} className="text-danger-500 hover:opacity-70" aria-label="Remove school">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="School" value={e.school} onChange={(v) => updateRow("education", i, { school: v })} />
                    <Select label="Degree" value={e.degree} onChange={(v) => updateRow("education", i, { degree: v })}
                      options={["High School Diploma", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "MBA", "Doctorate (PhD)", "Bootcamp", "Other"]} />
                    <Field label="Field of study" value={e.fieldOfStudy} onChange={(v) => updateRow("education", i, { fieldOfStudy: v })} />
                    <Field label="GPA" value={e.gpa} onChange={(v) => updateRow("education", i, { gpa: v })} placeholder="3.8" />
                    <Field label="School location" value={e.location} onChange={(v) => updateRow("education", i, { location: v })} />
                    <Field label="Start" type="month" value={e.startDate} onChange={(v) => updateRow("education", i, { startDate: v })} />
                    <Field label="End (or expected)" type="month" value={e.endDate} onChange={(v) => updateRow("education", i, { endDate: v })} />
                  </div>
                </div>
              ))}
              <button onClick={() => addRow("education", { school: "", degree: "" })} className="btn-ghost btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add school
              </button>
            </div>
          )}

          {/* ---------------- Skills ---------------- */}
          {section === "skills" && (
            <div className="space-y-5">
              <TagInput label="Skills" tags={p.skills ?? []} onChange={(t) => setPath("skills", t)} placeholder="React, TypeScript, Postgres…" />
              <TagInput label="Certifications" tags={p.certifications ?? []} onChange={(t) => setPath("certifications", t)} placeholder="AWS Solutions Architect…" />
              <Field label="Target role" value={p.targetRole} onChange={(v) => setPath("targetRole", v)} placeholder="Senior Frontend Engineer" hint="Premium scores each posting against this" />
            </div>
          )}

          {/* ---------------- Documents ---------------- */}
          {section === "documents" && (
            <div className="space-y-5">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-canvas px-6 py-10 text-center transition hover:border-brand-300 hover:bg-brand-50">
                <Upload className="h-6 w-6 text-brand-500" />
                <span className="mt-3 text-[15px] font-semibold">Upload your resume</span>
                <span className="mt-1 text-[13px] text-ink-soft">PDF, DOC, DOCX, TXT, PNG, JPG or WEBP · up to 12 MB</span>
                <span className="mt-1 text-[12px] text-ink-faint">Attached automatically to applications that ask for a file</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadResume(f); }}
                />
              </label>

              {/* Read the resume and fill in the rest of the profile from it. */}
              <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold">Fill this profile from your resume</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
                      Reads your work history, education, skills and links, then shows you what it found
                      before anything is saved.
                    </p>
                    <label className="btn-primary btn-sm mt-3 cursor-pointer">
                      {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {parsing ? "Reading your resume…" : "Read my resume"}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                        disabled={parsing}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readResume(f); }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {(p.documents ?? []).length > 0 && (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {p.documents.map((d: any, i: number) => (
                    <li key={d._id ?? i} className="flex items-center gap-3 px-4 py-3">
                      <FileText className="h-4 w-4 shrink-0 text-brand-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">{d.name}</p>
                        <p className="font-mono text-[11px] text-ink-faint">
                          {d.kind} · {Math.round((d.size ?? 0) / 1024)} KB
                        </p>
                      </div>
                      {d.isDefault && <span className="chip border-teal-500/30 bg-teal-500/10 text-teal-600">default</span>}
                      <button onClick={() => deleteDocument(d._id)} className="text-danger-500 hover:opacity-70" aria-label="Remove document">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ---------------- Work eligibility ---------------- */}
          {section === "eligibility" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Authorized to work in the country you're applying to?" value={p.workAuth?.authorizedToWork} onChange={(v) => setPath("workAuth.authorizedToWork", v)} options={YESNO} />
              <Select label="Will you need visa sponsorship?" value={p.workAuth?.requireSponsorship} onChange={(v) => setPath("workAuth.requireSponsorship", v)} options={YESNO} />
              <Select label="Work authorization type" value={p.workAuth?.workAuthType} onChange={(v) => setPath("workAuth.workAuthType", v)}
                options={["US Citizen", "Permanent Resident (Green Card)", "H-1B", "F-1 OPT", "F-1 CPT", "TN", "L-1", "EAD", "Other"]} />
              <Select label="Willing to relocate?" value={p.workAuth?.willingToRelocate} onChange={(v) => setPath("workAuth.willingToRelocate", v)} options={YESNO} />
              <Select label="Remote preference" value={p.workAuth?.remotePreference} onChange={(v) => setPath("workAuth.remotePreference", v)} options={["Remote", "Hybrid", "On-site", "No preference"]} />
              <Field label="Available start date" type="date" value={p.workAuth?.availableStartDate} onChange={(v) => setPath("workAuth.availableStartDate", v)} />
              <Field label="Notice period" value={p.workAuth?.noticePeriod} onChange={(v) => setPath("workAuth.noticePeriod", v)} placeholder="Two weeks" />
              <Select label="Are you over 18?" value={p.workAuth?.over18} onChange={(v) => setPath("workAuth.over18", v)} options={YESNO} />
              <Select label="Previously employed at this company?" value={p.workAuth?.previouslyEmployedHere} onChange={(v) => setPath("workAuth.previouslyEmployedHere", v)} options={YESNO} />
              <Field label="Referred by" value={p.workAuth?.referredBy} onChange={(v) => setPath("workAuth.referredBy", v)} />
              <Select label="How did you hear about us?" value={p.workAuth?.howDidYouHear} onChange={(v) => setPath("workAuth.howDidYouHear", v)}
                options={["Company website", "LinkedIn", "Indeed", "Referral", "Job board", "Recruiter", "Other"]} />
              <Select label="Security clearance" value={p.workAuth?.securityClearance} onChange={(v) => setPath("workAuth.securityClearance", v)} options={["None", "Confidential", "Secret", "Top Secret", "TS/SCI"]} />
            </div>
          )}

          {/* ---------------- Compensation ---------------- */}
          {section === "compensation" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Desired salary" value={p.compensation?.desiredSalary} onChange={(v) => setPath("compensation.desiredSalary", v)} placeholder="185000" />
              <Field label="Current salary" value={p.compensation?.currentSalary} onChange={(v) => setPath("compensation.currentSalary", v)} hint="Leave blank where it's illegal to ask" />
              <Select label="Currency" value={p.compensation?.salaryCurrency} onChange={(v) => setPath("compensation.salaryCurrency", v)} options={["USD", "EUR", "GBP", "INR", "CAD", "AUD"]} />
              <Select label="Period" value={p.compensation?.salaryPeriod} onChange={(v) => setPath("compensation.salaryPeriod", v)} options={["year", "month", "hour"]} />
            </div>
          )}

          {/* ---------------- EEO ---------------- */}
          {section === "eeo" && (
            <div className="space-y-5">
              <p className="rounded-xl border border-line bg-canvas px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
                These questions are voluntary on every application. Answer them once here, or tick decline
                and Zapply will select the decline option wherever it appears.
              </p>
              <label className="flex items-center gap-2.5 text-[14px]">
                <input
                  type="checkbox"
                  checked={!!p.eeo?.declineToSelfIdentify}
                  onChange={(e) => setPath("eeo.declineToSelfIdentify", e.target.checked)}
                />
                Decline to self-identify on all applications
              </label>

              {!p.eeo?.declineToSelfIdentify && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Gender" value={p.eeo?.gender} onChange={(v) => setPath("eeo.gender", v)} options={["Male", "Female", "Non-binary", "Prefer not to say"]} />
                  <Select label="Hispanic or Latino?" value={p.eeo?.hispanicLatino} onChange={(v) => setPath("eeo.hispanicLatino", v)} options={["Yes", "No", "Prefer not to say"]} />
                  <Select label="Race / ethnicity" value={p.eeo?.race} onChange={(v) => setPath("eeo.race", v)}
                    options={["American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White", "Two or More Races", "Prefer not to say"]} />
                  <Select label="Veteran status" value={p.eeo?.veteranStatus} onChange={(v) => setPath("eeo.veteranStatus", v)}
                    options={["I am not a protected veteran", "I identify as one or more of the classifications of a protected veteran", "I don't wish to answer"]} />
                  <Select label="Disability status" value={p.eeo?.disabilityStatus} onChange={(v) => setPath("eeo.disabilityStatus", v)}
                    options={["Yes, I have a disability", "No, I don't have a disability", "I don't wish to answer"]} />
                  <Field label="Signature name" value={p.eeo?.disabilitySignatureName} onChange={(v) => setPath("eeo.disabilitySignatureName", v)} hint="Some disability forms ask you to type your name" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {parsed && <ParsedReview parsed={parsed} onCancel={() => setParsed(null)} onAccept={acceptParsed} />}
    </div>
  );
}

/** Shows what was read out of the resume so the user accepts it section by section. */
function ParsedReview({
  parsed, onAccept, onCancel,
}: { parsed: any; onAccept: (s: Record<string, boolean>) => void; onCancel: () => void }) {
  const available = [
    ["personal", "Contact details", [parsed.personal?.firstName, parsed.personal?.email, parsed.personal?.phone, parsed.personal?.city].filter(Boolean).join(" · ")],
    ["experience", `Work history (${parsed.experience?.length ?? 0})`, (parsed.experience ?? []).slice(0, 3).map((e: any) => `${e.title} at ${e.company}`).join(" · ")],
    ["education", `Education (${parsed.education?.length ?? 0})`, (parsed.education ?? []).map((e: any) => `${e.degree} · ${e.school}`).join(" · ")],
    ["skills", `Skills (${parsed.skills?.length ?? 0})`, (parsed.skills ?? []).slice(0, 8).join(", ")],
    ["websites", `Links (${parsed.websites?.length ?? 0})`, (parsed.websites ?? []).map((w: any) => w.label).join(", ")],
    ["workAuth", "Work eligibility", [parsed.workAuth?.authorizedToWork, parsed.workAuth?.requireSponsorship, parsed.workAuth?.visaStatus].filter(Boolean).join(" · ")],
    ["compensation", "Compensation", [parsed.compensation?.desiredSalary, parsed.compensation?.currentSalary].filter(Boolean).join(" · ")],
    ["eeo", "EEO", [parsed.eeo?.gender, parsed.eeo?.race, parsed.eeo?.veteranStatus, parsed.eeo?.disabilityStatus].filter(Boolean).join(" · ")],
    ["summary", "Summary", parsed.summary?.slice(0, 90)],
  ].filter(([, , preview]) => preview) as [string, string, string][];

  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(available.map(([key]) => [key, true]))
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative flex max-h-[85vh] w-full max-w-[520px] animate-pop flex-col rounded-2xl bg-white shadow-lift">
        <div className="flex items-start justify-between gap-4 border-b border-line p-6 pb-4">
          <div>
            <h2 className="font-display text-[20px] font-extrabold">Here&apos;s what we read</h2>
            <p className="mt-1 text-[13.5px] text-ink-soft">
              Untick anything you&apos;d rather keep as it is. Existing values are never overwritten.
            </p>
          </div>
          <button onClick={onCancel} className="text-ink-faint hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-6 pt-4">
          {available.length === 0 && (
            <p className="py-6 text-center text-[14px] text-ink-soft">
              Nothing usable came back. If your resume is a scan, export a text-based PDF and try again.
            </p>
          )}
          {available.map(([key, title, preview]) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                checked[key] ? "border-brand-200 bg-brand-50/50" : "border-line bg-white"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 accent-brand-500"
                checked={!!checked[key]}
                onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))}
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{title}</span>
                <span className="mt-0.5 block truncate text-[12.5px] text-ink-soft">{preview}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 border-t border-line p-6 pt-4">
          <button onClick={onCancel} className="btn-ghost flex-1">Discard</button>
          <button
            onClick={() => onAccept(checked)}
            className="btn-primary flex-1"
            disabled={!available.some(([k]) => checked[k])}
          >
            <Check className="h-4 w-4" />
            Apply to profile
          </button>
        </div>
      </div>
    </div>
  );
}
