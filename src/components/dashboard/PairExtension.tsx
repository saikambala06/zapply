"use client";

import { useEffect, useState } from "react";
import { Puzzle, Loader2, RefreshCw, Copy, Check } from "lucide-react";

/**
 * Generates a short-lived code the user types into the extension popup once.
 * The extension trades it for a long-lived bearer token via POST /api/extension/pair.
 */
export default function PairExtension() {
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/extension/pair");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't generate a code.");
      setCode(json.data.code);
      setSecondsLeft(json.data.expiresInSeconds);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const expired = Boolean(code) && secondsLeft <= 0;
  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <Puzzle className="h-4 w-4 text-brand-500" />
        <h2 className="text-[15px] font-bold">Connect the extension</h2>
      </div>

      <div className="p-5">
        {!code ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              Generate a code, then enter it in the Zapply popup in your browser. Your profile and saved
              answers sync straight away.
            </p>
            <button onClick={generate} className="btn-primary btn-sm mt-4 w-full" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Generate pairing code
            </button>
          </>
        ) : (
          <>
            <div
              className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-4 transition ${
                expired ? "border-line bg-canvas" : "border-brand-200 bg-brand-50"
              }`}
            >
              {code.split("").map((ch, i) => (
                <span
                  key={i}
                  className={`font-mono text-[26px] font-semibold tracking-wider ${
                    expired ? "text-ink-faint line-through" : "text-brand-600"
                  }`}
                >
                  {ch}
                </span>
              ))}
            </div>

            <p className="mt-3 text-center font-mono text-[11px] text-ink-faint">
              {expired ? "Code expired" : `Expires in ${mmss}`}
            </p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="btn-ghost btn-sm flex-1"
                disabled={expired}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={generate} className="btn-ghost btn-sm flex-1" disabled={busy}>
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
                New code
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-[12.5px] text-danger-500">{error}</p>}
      </div>
    </section>
  );
}
