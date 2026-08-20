import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <Nav />
      <main className="container-x max-w-[640px] py-16">
        <p className="eyebrow">Contact</p>
        <h1 className="mt-3 font-display text-[36px] font-extrabold tracking-[-.02em]">Get in touch</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">
          Found a site where autofill misses fields? Send the job link — adapters get written from real
          examples, so a broken form is the most useful thing you can report.
        </p>

        <form className="mt-10 space-y-4" action="mailto:support@example.com" method="post">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="c-name">Name</label>
              <input id="c-name" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="c-email">Email</label>
              <input id="c-email" type="email" className="input" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="c-topic">Topic</label>
            <select id="c-topic" className="input">
              <option>A form didn&apos;t fill correctly</option>
              <option>Billing or subscription</option>
              <option>Feature request</option>
              <option>Something else</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-message">Message</label>
            <textarea id="c-message" className="input resize-y" rows={6} required />
          </div>
          <button className="btn-primary">Send message</button>
        </form>
      </main>
      <Footer />
    </>
  );
}
