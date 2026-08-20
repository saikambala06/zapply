import Link from "next/link";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import AutofillDemo from "@/components/marketing/AutofillDemo";
import Faq from "@/components/marketing/Faq";
import { ArrowRight, Layers, Radar, MessageSquareQuote, LineChart, Workflow, ShieldCheck } from "lucide-react";

const ATS = [
  "Greenhouse", "Lever", "Workday", "Ashby", "iCIMS", "SmartRecruiters", "Workable", "Taleo",
  "Jobvite", "BambooHR", "Breezy", "Rippling", "Dover", "JazzHR", "Recruitee", "Teamtailor",
  "SuccessFactors", "ADP", "Paylocity", "Oracle HCM", "Bullhorn", "Personio", "Pinpoint",
  "Greenhouse Embed", "Lever Postings",
];

const STEPS = [
  {
    n: "01",
    title: "Fill in your profile once",
    body: "Name, contact details, work history, education, links, work eligibility and EEO answers. Upload your resume and Zapply reads it to fill the rest.",
    icon: Layers,
  },
  {
    n: "02",
    title: "Open any job application",
    body: "Zapply recognises the form, maps every field to the right value, and fills it — including dropdowns, radio groups and the resume upload.",
    icon: Radar,
  },
  {
    n: "03",
    title: "Answer a custom question once",
    body: "Anything Zapply doesn't recognise, you answer yourself. It's saved and reused the next time a similar question shows up anywhere.",
    icon: MessageSquareQuote,
  },
];

export default function HomePage() {
  return (
    <>
      <Nav />

      <main>
        {/* ---------- Hero: the product doing its job ---------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_-10%,rgba(91,42,214,.14),transparent_70%)]"
          />
          <div className="container-x relative grid gap-12 py-14 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:items-center lg:py-20">
            <div>
              <Link
                href="/#premium"
                className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-[12px] font-semibold text-brand-600 transition hover:bg-brand-100"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulseDot" />
                Premium: AI answers + profile scoring
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              <h1 className="mt-5 font-display text-[40px] font-extrabold leading-[1.03] tracking-[-.03em] sm:text-[54px] lg:text-[58px]">
                The application
                <br />
                fills{" "}
                <span className="relative whitespace-nowrap text-brand-500">
                  itself
                  <svg
                    aria-hidden
                    viewBox="0 0 240 14"
                    className="absolute -bottom-1.5 left-0 h-3 w-full text-teal-500"
                    preserveAspectRatio="none"
                  >
                    <path d="M2 10C58 3 120 2 238 6" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
                .
              </h1>

              <p className="mt-6 max-w-[460px] text-[17px] leading-relaxed text-ink-soft">
                Zapply is a browser extension that completes job applications for you, remembers the answers
                you write, and logs everywhere you&apos;ve applied — without you touching a tracker.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/auth?mode=signup" className="btn-primary">
                  Add to Chrome — free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/docs" className="btn-ghost">Read the docs</Link>
              </div>

              <dl className="mt-10 grid max-w-[440px] grid-cols-3 gap-6 border-t border-line pt-6">
                {[
                  ["25+", "ATS platforms"],
                  ["~14s", "per application"],
                  ["0", "trackers to update"],
                ].map(([stat, label]) => (
                  <div key={label}>
                    <dt className="font-display text-[26px] font-extrabold leading-none text-ink">{stat}</dt>
                    <dd className="mt-1.5 text-[12px] leading-tight text-ink-soft">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <AutofillDemo />
          </div>
        </section>

        {/* ---------- ATS marquee ---------- */}
        <section className="border-y border-line bg-white py-6">
          <p className="container-x mb-4 text-center font-mono text-[11px] uppercase tracking-[.18em] text-ink-faint">
            Works on the application systems companies actually use
          </p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <div className="flex w-max animate-marquee gap-3 px-3">
              {[...ATS, ...ATS].map((name, i) => (
                <span key={`${name}-${i}`} className="chip whitespace-nowrap border-line bg-canvas">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="container-x scroll-mt-20 py-20">
          <p className="eyebrow">Autofill</p>
          <h2 className="mt-3 max-w-[560px] font-display text-[32px] font-extrabold leading-[1.1] tracking-[-.02em] sm:text-[40px]">
            Three steps, and the third one only happens once.
          </h2>

          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card group relative p-6 transition hover:border-brand-200 hover:shadow-lift">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-500 transition group-hover:bg-brand-500 group-hover:text-white">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-[12px] text-ink-faint">{s.n}</span>
                </div>
                <h3 className="mt-5 text-[18px] font-bold">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Tracker ---------- */}
        <section id="tracker" className="scroll-mt-20 border-y border-line bg-white py-20">
          <div className="container-x grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="eyebrow">Tracker</p>
              <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.1] tracking-[-.02em] sm:text-[40px]">
                Every application logs itself.
              </h2>
              <p className="mt-5 max-w-[440px] text-[16px] leading-relaxed text-ink-soft">
                When you submit, Zapply captures the role, the company and the link, then files it under
                Applied. Move it through your pipeline as you hear back.
              </p>

              <ul className="mt-8 space-y-4">
                {[
                  [Workflow, "Pipeline stages", "Saved, applied, screen, interview, offer. Drag a card, the date stamps itself."],
                  [LineChart, "Search insights", "Applications per day against your goal, plus the reply rate you're actually getting."],
                  [ShieldCheck, "No duplicates", "Re-open a posting you already applied to and Zapply tells you before you apply twice."],
                ].map(([Icon, title, body]) => {
                  const I = Icon as typeof Workflow;
                  return (
                    <li key={title as string} className="flex gap-4">
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-brand-500">
                        <I className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[15px] font-semibold">{title as string}</p>
                        <p className="mt-0.5 text-[14px] leading-relaxed text-ink-soft">{body as string}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <TrackerPreview />
          </div>
        </section>

        {/* ---------- Saved responses ---------- */}
        <section id="responses" className="container-x scroll-mt-20 py-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="card overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <p className="eyebrow">Saved answers</p>
                </div>
                <ul className="divide-y divide-line">
                  {[
                    ["Why are you interested in this role?", "Used 34 times", "long"],
                    ["What are your salary expectations?", "Used 41 times", "text"],
                    ["Are you legally authorized to work in the US?", "Yes · used 58 times", "select"],
                    ["When can you start?", "Two weeks' notice · used 29 times", "text"],
                  ].map(([q, meta, kind]) => (
                    <li key={q} className="flex items-start gap-3 px-5 py-4">
                      <span className="mt-1 chip border-brand-200 bg-brand-50 text-brand-600">{kind}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium">{q}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{meta}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="eyebrow">Answer memory</p>
              <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.1] tracking-[-.02em] sm:text-[40px]">
                Write it once. Never again.
              </h2>
              <p className="mt-5 max-w-[440px] text-[16px] leading-relaxed text-ink-soft">
                Custom questions are what make applications slow. Zapply normalises the wording, so
                &ldquo;Why this company?&rdquo; and &ldquo;What draws you to us?&rdquo; hit the same saved answer —
                even on a different site.
              </p>
              <Link href="/auth?mode=signup" className="btn-dark mt-8">
                Start saving answers
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- Premium ---------- */}
        <section id="premium" className="scroll-mt-20 bg-brand-900 py-20 text-white">
          <div className="container-x">
            <div className="max-w-[620px]">
              <p className="font-mono text-[11px] uppercase tracking-[.18em] text-brand-300">Premium</p>
              <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.1] tracking-[-.02em] sm:text-[42px]">
                Apply fast without applying blind.
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-brand-100/80">
                Volume gets you interviews; fit gets you offers. Premium keeps both, with a 3-day free trial
                and no card up front.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                ["Multiple profiles", "Keep a profile per track — one for backend roles, one for PM roles — each with its own resume."],
                ["Profile scoring", "Zapply reads the posting and tells you which profile fits best, and where you're short."],
                ["Generated answers", "Custom questions drafted from your own history. You edit, then it saves like any other answer."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[.04] p-6 backdrop-blur">
                  <h3 className="text-[17px] font-bold">{title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-brand-100/70">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/auth?mode=signup"
                className="btn bg-white px-5 py-3 text-brand-900 hover:bg-brand-50"
              >
                Start the 3-day trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="font-mono text-[12px] text-brand-100/60">$9/month after · cancel anytime</span>
            </div>
          </div>
        </section>

        <Faq />

        {/* ---------- Closing ---------- */}
        <section className="border-t border-line bg-white py-20">
          <div className="container-x text-center">
            <h2 className="mx-auto max-w-[520px] font-display text-[30px] font-extrabold leading-[1.12] tracking-[-.02em] sm:text-[38px]">
              The next application takes fourteen seconds.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/auth?mode=signup" className="btn-primary">
                Get Zapply free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/docs" className="btn-ghost">See how it works</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

/* A static snapshot of the tracker, used as illustration on the marketing page. */
function TrackerPreview() {
  const rows = [
    ["Senior Product Engineer", "Northwind", "Interview", "teal"],
    ["Frontend Engineer II", "Cobalt Labs", "Screen", "amber"],
    ["Full-Stack Engineer", "Harbor", "Applied", "brand"],
    ["Platform Engineer", "Kestrel", "Applied", "brand"],
    ["Software Engineer, Growth", "Lumen", "Rejected", "gray"],
  ];
  const tone: Record<string, string> = {
    teal: "bg-teal-500/10 text-teal-600",
    amber: "bg-amber-500/15 text-amber-600",
    brand: "bg-brand-50 text-brand-600",
    gray: "bg-canvas text-ink-faint",
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <p className="text-[14px] font-semibold">This week</p>
        <span className="font-mono text-[12px] text-ink-faint">31 applications</span>
      </div>

      <div className="flex items-end gap-1.5 px-5 pt-5">
        {[4, 7, 3, 9, 6, 2, 0].map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className="w-full rounded-t-[4px] bg-gradient-to-t from-brand-500 to-brand-400"
              style={{ height: `${Math.max(v * 8, 4)}px` }}
            />
            <span className="font-mono text-[10px] text-ink-faint">{"MTWTFSS"[i]}</span>
          </div>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {rows.map(([title, company, stage, color]) => (
          <li key={title} className="flex items-center gap-3 px-5 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-canvas font-display text-[12px] font-bold text-ink-soft">
              {company[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{title}</p>
              <p className="truncate font-mono text-[11px] text-ink-faint">{company}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone[color]}`}>{stage}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
