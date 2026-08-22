"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowRight, Check } from "lucide-react";
import Logo from "@/components/ui/Logo";

export default function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin"
  );
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  // Google redirects back here with ?error=… when something goes wrong.
  const oauthError = params.get("error");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNotice({ text: json.data.message, link: json.data.devLink });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup" ? form : { email: form.email, password: form.password }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "That didn't work. Try again.");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" aria-label="Zapply home">
          <Logo />
        </Link>

        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-[30px] font-extrabold tracking-[-.02em]">
            {forgot ? "Reset your password" : mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            {forgot
              ? "Enter your email and we'll send you a link to set a new one."
              : mode === "signup"
              ? "Your profile syncs to the extension. Premium is free for 3 days."
              : "Sign in to your profile, tracker and saved answers."}
          </p>

          {oauthError && !notice && (
            <p role="alert" className="mt-5 rounded-xl border border-danger-500/25 bg-danger-500/5 px-3.5 py-2.5 text-[13px] text-danger-600">
              {OAUTH_ERRORS[oauthError] ?? "Google sign-in didn't complete. Try again."}
            </p>
          )}

          {notice ? (
            <div className="mt-8 rounded-xl border border-teal-500/30 bg-teal-500/5 px-4 py-4">
              <p className="text-[14px] leading-relaxed text-ink">{notice.text}</p>
              {notice.link && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
                  No mail provider is configured, so here&apos;s the link directly:{" "}
                  <a href={notice.link} className="break-all font-mono text-brand-600 underline">
                    {notice.link}
                  </a>
                </p>
              )}
              <button
                onClick={() => { setNotice(null); setForgot(false); }}
                className="btn-ghost btn-sm mt-4"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              {!forgot && (
                <>
                  <a href="/api/auth/google" className="btn-ghost mt-8 w-full py-3">
                    <GoogleMark />
                    Continue with Google
                  </a>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">or</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                </>
              )}

              <form onSubmit={forgot ? requestReset : submit} className={forgot ? "mt-8 space-y-4" : "space-y-4"}>
                {mode === "signup" && !forgot && (
                  <div>
                    <label className="label" htmlFor="name">Full name</label>
                    <input
                      id="name"
                      className="input"
                      value={form.name}
                      onChange={set("name")}
                      placeholder="Aarav Mehta"
                      autoComplete="name"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>

                {!forgot && (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <label className="label" htmlFor="password">Password</label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={() => { setForgot(true); setError(""); }}
                          className="mb-1.5 text-[12.5px] font-medium text-brand-600 hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      id="password"
                      type="password"
                      className="input"
                      value={form.password}
                      onChange={set("password")}
                      placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={mode === "signup" ? 8 : undefined}
                    />
                  </div>
                )}

                {error && (
                  <p role="alert" className="rounded-xl border border-danger-500/25 bg-danger-500/5 px-3.5 py-2.5 text-[13px] text-danger-600">
                    {error}
                  </p>
                )}

                <button className="btn-primary w-full py-3" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {forgot ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </button>

                {forgot && (
                  <button
                    type="button"
                    onClick={() => { setForgot(false); setError(""); }}
                    className="btn-ghost w-full"
                  >
                    Back to sign in
                  </button>
                )}
              </form>
            </>
          )}

          {!forgot && !notice && (
          <p className="mt-6 text-center text-[14px] text-ink-soft">
            {mode === "signup" ? "Already have an account?" : "New to Zapply?"}{" "}
            <button
              className="font-semibold text-brand-600 hover:underline"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError("");
              }}
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
          )}
        </div>
      </div>

      {/* Context side */}
      <aside className="hidden flex-col justify-center bg-brand-900 px-12 text-white lg:flex">
        <p className="font-mono text-[11px] uppercase tracking-[.18em] text-brand-300">What you get</p>
        <h2 className="mt-4 max-w-[380px] font-display text-[34px] font-extrabold leading-[1.1] tracking-[-.02em]">
          One profile. Every application form.
        </h2>
        <ul className="mt-9 space-y-4">
          {[
            "Autofill across 25+ application systems",
            "Answers saved once and reused everywhere",
            "Applications tracked the moment you submit",
            "Resume attached automatically",
            "Premium: profile scoring and generated answers",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-500/20">
                <Check className="h-3 w-3 text-teal-400" strokeWidth={3} />
              </span>
              <span className="text-[15px] text-brand-100/85">{line}</span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "You cancelled the Google sign-in.",
  bad_state: "That sign-in link expired. Start again.",
  not_configured: "Google sign-in isn't set up on this deployment.",
  token_exchange_failed: "Google wouldn't complete the sign-in. Try again.",
  profile_fetch_failed: "We couldn't read your Google profile. Try again.",
  no_email: "That Google account has no email address attached.",
  missing_code: "Google sign-in didn't complete. Try again.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.8c2.2-2 3.7-5 3.7-8.5Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.8-2.9l-3.7-2.9c-1 .7-2.3 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5l-3.9 3A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.7l-3.9-3a12 12 0 0 0 0 10.8l3.9-3.1Z" />
      <path fill="#EA4335" d="M12 4.7c2.2 0 3.7.9 4.5 1.7l3.3-3.2A11.6 11.6 0 0 0 12 0 12 12 0 0 0 1.4 6.6l3.9 3c.9-2.8 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}
