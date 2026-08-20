"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const ITEMS = [
  {
    q: "How do I install it?",
    a: "Create an account, then load the extension in your browser. The dashboard shows a 6-character pairing code — enter it in the extension popup once and your profile syncs. From then on, open any job application and it fills.",
  },
  {
    q: "Which application systems does it support?",
    a: "The common ones: Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters, Workable, Taleo, Jobvite, BambooHR and about fifteen more. On sites without a dedicated adapter, Zapply falls back to reading field labels, which handles most plain HTML forms too.",
  },
  {
    q: "Where is my data stored?",
    a: "In your own MongoDB database. Your profile, saved answers and applications belong to your account and are never shared with third parties. Resumes are stored on your profile record and sent only to the job site you're applying on.",
  },
  {
    q: "What does Premium add?",
    a: "Multiple profiles, profile scoring against each posting, and generated answers for custom questions. There's a 3-day trial with no card required.",
  },
  {
    q: "Will it submit applications without me?",
    a: "Only if you turn on Auto Pilot in Settings, which is off by default. Otherwise Zapply fills the form and stops — you review and submit.",
  },
  {
    q: "Can I still edit what it fills?",
    a: "Yes. Everything it types is a normal form value. Change anything before you submit, and if you change a saved answer, Zapply updates the saved version too.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="container-x scroll-mt-20 py-20">
      <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <p className="eyebrow">Questions</p>
          <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.1] tracking-[-.02em] sm:text-[38px]">
            Before you install.
          </h2>
        </div>

        <ul className="divide-y divide-line border-y border-line">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="text-[16px] font-semibold">{item.q}</span>
                  <Plus
                    className={`h-4 w-4 shrink-0 text-brand-500 transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="animate-pop pb-5 pr-8 text-[15px] leading-relaxed text-ink-soft">{item.a}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
