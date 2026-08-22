import Link from "next/link";
import Logo from "@/components/ui/Logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "Autofill" },
      { href: "/#tracker", label: "Application tracker" },
      { href: "/#responses", label: "Saved answers" },
      { href: "/#premium", label: "Premium" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/docs#install", label: "Install guide" },
      { href: "/jobs", label: "Job board" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-[260px] text-[14px] leading-relaxed text-ink-soft">
            One click fills the form. Every application lands in your tracker on its own.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="eyebrow mb-3 text-ink-faint">{col.title}</h4>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[14px] text-ink-soft transition hover:text-brand-600">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[12px] text-ink-faint">
            © {new Date().getFullYear()} Zapply. Built as an open-source demo project.
          </p>
          <p className="font-mono text-[12px] text-ink-faint">Chrome · Edge · Firefox</p>
        </div>
      </div>
    </footer>
  );
}
