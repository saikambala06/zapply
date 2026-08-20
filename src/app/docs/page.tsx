import Link from "next/link";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "Docs" };

const SECTIONS = [
  {
    id: "install",
    title: "Install and pair",
    steps: [
      "Create a Zapply account. A profile is made for you automatically.",
      "Load the extension: open chrome://extensions, turn on Developer mode, choose Load unpacked, and pick the extension folder.",
      "Open Overview in your dashboard and click Generate pairing code.",
      "Click the Zapply icon in your browser, enter the 6-character code, and press Connect. Your profile syncs immediately.",
    ],
  },
  {
    id: "profile",
    title: "Fill in your profile",
    steps: [
      "Personal details, work history, education, links and skills are what get typed into forms.",
      "Upload a resume — it's attached to applications that ask for a file, and parsed to fill the rest of your profile.",
      "Work eligibility covers the sponsorship, relocation and start-date questions almost every application asks.",
      "EEO answers are optional. Tick decline to self-identify and Zapply picks the decline option everywhere.",
    ],
  },
  {
    id: "autofill",
    title: "Autofill an application",
    steps: [
      "Open any job application. Zapply detects the platform and fills what it recognises.",
      "A status pill shows how many fields were filled and which were skipped.",
      "Anything it couldn't answer stays blank for you. Type your answer once — it's saved.",
      "Review, then submit. Auto Pilot in Settings will submit for you, but it's off by default.",
    ],
  },
  {
    id: "responses",
    title: "Saved answers",
    steps: [
      "Custom questions are normalised before matching, so different phrasings hit the same stored answer.",
      "Edit any saved answer from the dashboard and the new version is used next time.",
      "Pin the answers you want kept at the top of the list.",
      "With Premium, unmatched questions can be drafted from your profile for you to edit.",
    ],
  },
  {
    id: "tracker",
    title: "Application tracker",
    steps: [
      "Submitting an application logs the role, company, link and platform under Applied.",
      "Move a row through screen, interview, offer or rejected as you hear back — each change is timestamped.",
      "Re-opening a posting you already applied to shows a warning instead of filling again.",
      "Add anything you applied to outside the extension with Add manually.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    steps: [
      "Fill on load, Auto Pilot, the status pill and automatic tracking are each independent switches.",
      "Raise the typing delay if a site's dropdowns lag behind the fill.",
      "Add domains to the skip list to stop Zapply touching forms on those sites.",
      "Set a daily goal to drive the activity chart on your overview.",
    ],
  },
];

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="container-x grid gap-12 py-14 lg:grid-cols-[200px_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow mb-3">Guides</p>
          <ul className="space-y-1.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-[14px] text-ink-soft transition hover:text-brand-600">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h1 className="font-display text-[36px] font-extrabold tracking-[-.02em]">Documentation</h1>
          <p className="mt-3 max-w-[560px] text-[16px] leading-relaxed text-ink-soft">
            Zapply is a browser extension backed by your account. Set up the profile once, and every
            application form after that is a click.
          </p>

          <div className="mt-12 space-y-12">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="font-display text-[24px] font-extrabold tracking-[-.01em]">{s.title}</h2>
                <ol className="mt-4 space-y-3">
                  {s.steps.map((step, i) => (
                    <li key={i} className="flex gap-3.5">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-50 font-mono text-[11px] font-semibold text-brand-600">
                        {i + 1}
                      </span>
                      <p className="text-[15px] leading-relaxed text-ink-soft">{step}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-line bg-white p-6">
            <h3 className="text-[17px] font-bold">Ready to try it?</h3>
            <p className="mt-1.5 text-[14px] text-ink-soft">Setup takes about five minutes, most of it filling in your profile.</p>
            <Link href="/auth?mode=signup" className="btn-primary mt-4">
              Create an account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
