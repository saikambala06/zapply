import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import { ExternalLink } from "lucide-react";

export const metadata = { title: "Job board" };

const BOARDS = [
  { name: "Greenhouse job boards", url: "https://boards.greenhouse.io", note: "Used by most mid-size and late-stage startups." },
  { name: "Lever postings", url: "https://jobs.lever.co", note: "Common at Series A–C companies." },
  { name: "Ashby", url: "https://jobs.ashbyhq.com", note: "Newer boards, clean forms, fills quickly." },
  { name: "Workday", url: "https://www.myworkdayjobs.com", note: "Enterprise. The longest forms — the biggest time saving." },
  { name: "SmartRecruiters", url: "https://jobs.smartrecruiters.com", note: "Widely used in Europe." },
  { name: "Workable", url: "https://apply.workable.com", note: "Small and mid-size companies." },
];

export default function JobsPage() {
  return (
    <>
      <Nav />
      <main className="container-x py-14">
        <p className="eyebrow">Where to apply</p>
        <h1 className="mt-3 max-w-[620px] font-display text-[36px] font-extrabold leading-[1.1] tracking-[-.02em]">
          Zapply works on the boards where the jobs actually are.
        </h1>
        <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-ink-soft">
          There&apos;s no shortcut to finding openings, but there is one to applying. Open any posting on
          these platforms with the extension running and the form fills itself.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BOARDS.map((b) => (
            <li key={b.name}>
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card flex h-full flex-col p-5 transition hover:border-brand-200 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[16px] font-bold">{b.name}</h2>
                  <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" />
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{b.note}</p>
                <p className="mt-4 font-mono text-[11px] text-brand-500">{new URL(b.url).hostname}</p>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
