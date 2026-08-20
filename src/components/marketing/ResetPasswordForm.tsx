"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowRight, Check } from "lucide-react";
import Logo from "@/components/ui/Logo";

export default function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-8 sm:px-12">
      <Link href="/" aria-label="Zapply home">
        <Logo />
      </Link>

      <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
        {!token ? (
          <>
            <h1 className="font-display text-[28px] font-extrabold tracking-[-.02em]">
              This link is incomplete
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Reset links expire after an hour and work once. Request a fresh one and use the newest
              email.
            </p>
            <Link href="/auth" className="btn-primary mt-6">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-[28px] font-extrabold tracking-[-.02em]">
              Set a new password
            </h1>
            <p className="mt-2 text-[15px] text-ink-soft">
              Pick something you haven&apos;t used elsewhere. You&apos;ll be signed in straight after.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <div>
                <label className="label" htmlFor="pw">New password</label>
                <input
                  id="pw"
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  autoFocus
                />
                {tooShort && <p className="mt-1 text-[12px] text-amber-600">A few more characters — 8 minimum.</p>}
              </div>

              <div>
                <label className="label" htmlFor="pw2">Confirm password</label>
                <input
                  id="pw2"
                  type="password"
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {mismatch && <p className="mt-1 text-[12px] text-amber-600">These don&apos;t match yet.</p>}
                {confirm.length > 0 && !mismatch && (
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-teal-600">
                    <Check className="h-3 w-3" strokeWidth={3} /> Match
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-xl border border-danger-500/25 bg-danger-500/5 px-3.5 py-2.5 text-[13px] text-danger-600">
                  {error}
                </p>
              )}

              <button className="btn-primary w-full py-3" disabled={busy || tooShort || mismatch}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save password
                {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
