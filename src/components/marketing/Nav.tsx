"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import Logo from "@/components/ui/Logo";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#tracker", label: "Tracker" },
  { href: "/#premium", label: "Premium" },
  { href: "/docs", label: "Docs" },
  { href: "/jobs", label: "Jobs" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-white/85 backdrop-blur-md">
      <nav className="container-x flex h-16 items-center justify-between gap-4">
        <Link href="/" className="shrink-0" aria-label="Zapply home">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-lg px-3 py-2 text-[14px] font-medium text-ink-soft transition hover:bg-brand-50 hover:text-brand-600"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/auth" className="btn-ghost btn-sm">Sign in</Link>
          <Link href="/auth?mode=signup" className="btn-primary btn-sm">Get the extension</Link>
        </div>

        <button
          className="rounded-lg border border-line p-2 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-line bg-white md:hidden">
          <ul className="container-x flex flex-col py-3">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-2.5 text-[15px] font-medium text-ink-soft"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex gap-2">
              <Link href="/auth" className="btn-ghost btn-sm flex-1">Sign in</Link>
              <Link href="/auth?mode=signup" className="btn-primary btn-sm flex-1">Get started</Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
