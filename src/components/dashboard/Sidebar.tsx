"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, User, Briefcase, MessageSquareQuote, Settings, Sparkles,
  LogOut, Menu, X,
} from "lucide-react";
import Logo from "@/components/ui/Logo";
import { initials } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/applications", label: "Applications", icon: Briefcase },
  { href: "/dashboard/responses", label: "Saved answers", icon: MessageSquareQuote },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

type Account = { name: string; email: string; premium: boolean; trialDaysLeft: number };

export default function Sidebar({ account }: { account: Account }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <Link href="/" className="mb-6 px-2 pt-1" aria-label="Zapply home">
        <Logo dark />
      </Link>

      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${
              active ? "bg-white/10 text-white" : "text-brand-100/65 hover:bg-white/[.06] hover:text-white"
            }`}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}

      <Link
        href="/dashboard/premium"
        onClick={() => setOpen(false)}
        className={`mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${
          pathname === "/dashboard/premium"
            ? "bg-white/10 text-white"
            : "text-amber-400 hover:bg-white/[.06]"
        }`}
      >
        <Sparkles className="h-[18px] w-[18px]" />
        Premium
        {!account.premium && (
          <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-400">
            Try
          </span>
        )}
      </Link>

      <div className="flex-1" />

      {account.premium && account.trialDaysLeft > 0 && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-[12px] font-semibold text-white">Trial active</p>
          <p className="mt-0.5 font-mono text-[11px] text-brand-100/60">
            {account.trialDaysLeft} day{account.trialDaysLeft === 1 ? "" : "s"} left
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] p-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 font-display text-[12px] font-bold text-white">
          {initials(account.name || account.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white">{account.name || "Your account"}</p>
          <p className="truncate font-mono text-[10px] text-brand-100/50">{account.email}</p>
        </div>
        <button onClick={signOut} aria-label="Sign out" className="rounded-lg p-1.5 text-brand-100/60 hover:bg-white/10 hover:text-white">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-white px-5 py-3 lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg border border-line p-2">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[268px] bg-brand-900">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen bg-brand-900 lg:block">{nav}</aside>
    </>
  );
}
