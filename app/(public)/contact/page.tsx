import Link from "next/link"

export const metadata = {
  title: "Contact — Pleks",
  description: "Talk to the person building Pleks. Email Stéan directly, or book a 20-minute call to walk the numbers together.",
}

export default function ContactPage() {
  return (
    <section style={{ padding: "88px 0 96px" }}>
      <div className="pub-wrap" style={{ maxWidth: 720 }}>

        <div className="pub-eyebrow" style={{ marginBottom: 14 }}>
          <span className="amber-rule" />Contact
        </div>

        <h1 className="pub-h1" style={{ margin: "0 0 20px", maxWidth: "22ch" }}>
          Talk to the person who built it.
        </h1>

        <p className="pub-body-lg" style={{ maxWidth: "56ch", margin: "0 0 16px" }}>
          No SDR, no contact form lottery. Pleks is small enough that the founder still answers
          the email himself — and prefers to. Whether you want a 20-minute walk-through,
          a question about pricing, or to push back on something the site claims, you&apos;re
          in the right place.
        </p>

        <p className="pub-body-lg" style={{ maxWidth: "56ch", margin: "0 0 40px" }}>
          Two ways in, depending on how much time you&apos;ve got:
        </p>

        {/* ── Path 1 — Direct email ── */}
        <div style={{
          border: "1px solid var(--rule)",
          borderRadius: "var(--r-md)",
          background: "var(--paper-raised)",
          padding: "28px 32px",
          marginBottom: 16,
          boxShadow: "var(--shadow-2)",
        }}>
          <div className="pub-eyebrow" style={{ marginBottom: 10, color: "var(--amber-ink)" }}>
            <span className="amber-rule" />Direct
          </div>
          <h2 className="pub-h2" style={{ margin: "0 0 10px" }}>
            Email me. I&apos;ll reply.
          </h2>
          <p className="pub-body" style={{ margin: "0 0 20px", maxWidth: "52ch" }}>
            Whatever you want to ask. Pricing, edge cases, &ldquo;is this safe to pilot,&rdquo; anything.
            One business day at the outside. Usually faster.
          </p>
          <a
            href="mailto:stean@pleks.co.za"
            className="btn-pleks"
            style={{ textDecoration: "none" }}
          >
            stean@pleks.co.za
          </a>
        </div>

        {/* ── Path 2 — Book a call ── */}
        <div style={{
          border: "1px solid var(--rule)",
          borderRadius: "var(--r-md)",
          background: "var(--paper-sunk)",
          padding: "28px 32px",
        }}>
          <div className="pub-eyebrow" style={{ marginBottom: 10 }}>
            <span className="amber-rule" />Walk it through together
          </div>
          <h2 className="pub-h2" style={{ margin: "0 0 10px" }}>
            Book a 20-minute call.
          </h2>
          <p className="pub-body" style={{ margin: "0 0 20px", maxWidth: "52ch" }}>
            For agencies weighing a switch, owners with a portfolio mid-handover,
            or anyone who&apos;d rather show me their setup than describe it. We&apos;ll cover
            what you need, and I&apos;ll be honest if Pleks isn&apos;t the right fit yet.
          </p>
          <Link href="/early-access" className="btn-pleks ghost">
            Book a call →
          </Link>
        </div>

        {/* ── Quiet bottom note ── */}
        <p className="pub-small" style={{ marginTop: 40, color: "var(--ink-faint)" }}>
          Pleks · Western Cape, South Africa · ZA business hours.
        </p>

      </div>
    </section>
  )
}
