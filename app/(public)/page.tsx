import { getSiteContent } from "@/lib/supabase/public"
import Link from "next/link"
import { TierGrid } from "./TierGrid"
import { RentRollSVG }           from "./svgs/RentRollSVG"
import { IsometricBuildingsSVG } from "./svgs/IsometricBuildingsSVG"
import { FitScoreSVG }            from "./svgs/FitScoreSVG"
import { PricingSVG }             from "./svgs/PricingSVG"
import { VaultDoorSVG }           from "./svgs/VaultDoorSVG"
import { FounderSection }         from "@/components/marketing/founder/FounderSection"

export const revalidate = 3600

export const metadata = {
  title: "Pleks — SA Property Management, Built Right",
  description: "Built by a practitioner who did it for eleven years. Applicant-paid FitScore screening. Automated DebiCheck collections. Tribunal-ready documentation by default.",
}

const DEFAULTS: Record<string, string> = {
  notice:             "Founding-agent cohort now open — seven seats remaining",
  hero_cta_primary:   "Start free — 1 unit, no card",
  hero_cta_secondary: "Book a 20-min demo",
  hero_meta_1_n:      "R 0",
  hero_meta_1_l:      "Client money Pleks ever holds",
  hero_meta_2_n:      "14 / 21",
  hero_meta_2_l:      "Day deposit clock, tracked automatically",
  hero_meta_3_n:      "Full cycle",
  hero_meta_3_l:      "Legal, development, management. Hands on each.",
  why_sub:            "Every other claim on this page — the automation, the statements, the rent collection — falls out of getting these two right. Everything else is table stakes.",
  artefact_sub:       "Most rental software sells screenshots. The artefact below is what your landlords, the Tribunal, and your accountant actually see.",
  pricing_sub:        "Priced per active lease, not per address or per seat. Vacancies cost you nothing. Your bill on the 1st is the bill on the 1st — and if it ever changes, your accountant knows 30 days before it does.",
  founding_sub:       "In exchange for being first, I'll ask for a thirty-minute call a month while we're still in the first year — because that's how you get software written by someone who's actually listening.",
  founding_counter:   "03 / 10 claimed · Joburg, Cape Town, Durban",
}

function c(content: Record<string, string>, key: string): string {
  return content[key] ?? DEFAULTS[key] ?? ""
}

const TIERS = [
  { name: "Steward",    leaseCap: 15,   leases: "Up to 15 active leases",   price: "699",   perLease: "That's roughly R47 per lease at cap", desc: "Solo practitioners just holding their own book." },
  { name: "Growth",     leaseCap: 30,   leases: "Up to 30 active leases",   price: "1,199", perLease: "That's roughly R40 per lease at cap", desc: "Building a book, two pairs of hands, one landlord at a time." },
  { name: "Portfolio",  leaseCap: 75,   leases: "Up to 75 active leases",   price: "2,599", perLease: "That's roughly R35 per lease at cap", desc: "A small agency running a real portfolio, with a trust account that reconciles nightly." },
  { name: "Firm",       leaseCap: 150,  leases: "Up to 150 active leases",  price: "4,499", perLease: "That's roughly R30 per lease at cap", desc: "Established firms with a principal, multiple agents, and HOAs on the side." },
  { name: "Beyond 150", leaseCap: null, leases: "Custom · Bespoke",         price: null,    perLease: "One call · ZA hours",  desc: "More than 150 active leases? The pricing bends for you too — that's a conversation, not a form." },
] satisfies import("./TierGrid").TierData[]

const AUDIT_ROWS = [
  { line: "Platform · per-user fee",              incumbent: "R400–R800 per user / mo",   pleks: "Tier fee only"        },
  { line: "Credit & background checks",           incumbent: "R70–R200 per applicant",    pleks: "Applicant pays direct" },
  { line: "SMS & WhatsApp notifications",         incumbent: "R0.35–R0.60 each, metered", pleks: "Tier fee only"        },
  { line: "Trust-account module",                 incumbent: "R300–R600 / mo add-on",     pleks: "Tier fee only"        },
  { line: "Inspection app",                       incumbent: "R250–R400 / mo add-on",     pleks: "Tier fee only"        },
  { line: "E-signature",                          incumbent: "R15–R45 per lease signed",  pleks: "Tier fee only"        },
  { line: "Bank-feed / accounting integration",   incumbent: "R200–R350 / mo",            pleks: "Tier fee only"        },
  { line: "Onboarding & data migration",          incumbent: "R3,500–R8,000 one-off",     pleks: "Free"                 },
  { line: "AI-drafted Tribunal bundle",           incumbent: "Not offered · manual",      pleks: "Included"             },
]

const INCLUDED = [
  "Trust account reconciliation",      "Applicant FitScore · unlimited",
  "Landlord portal + monthly statements","Inspection app · iOS + Android",
  "E-signature on every lease",        "WhatsApp + SMS reminders",
  "Debit-order rent collection",       "Tenant application portal",
  "Contractor + work-order portal",    "Arrears automation + letter pack",
  "AI-drafted Tribunal bundle",        "Immutable audit log · 7 yr retention",
  "Onboarding + data migration",       "POPIA consent + DSAR tooling",
  "Accounting export · Xero + Sage",   "Support · ZA business hours",
]

const PILLAR_1 = [
  { g: "A", bold: "Inspections that hold up.",                  rest: " Photos carry their own time and address. A tenant can't argue the date when the camera knows it." },
  { g: "B", bold: "Deposit clock, built in.",                   rest: " 14 days no claim, 21 days with one. Every deduction itemised; wear-and-tear separated from damage so you're never deducting what you shouldn't." },
  { g: "C", bold: "Consent on file before every credit check.", rest: " No \"we never agreed to that\" three months later. POPIA-compliant by default — not after you've trained your staff for an afternoon." },
  { g: "D", bold: "One file per tenant. One file per unit.",    rest: " Whoever handled it, whatever month it was — it's all in the same place, in the order it happened." },
  { g: "E", bold: "Arrears letters drafted for you.",           rest: " Reviewed by you before they leave. Tone steps up by stage — reminder, demand, pre-Tribunal — so the right letter goes out at the right time." },
]

const PILLAR_2 = [
  { g: "A", bold: "Applicants pay, not you.",                       rest: " Joint applications billed once. The check happens before they take up an afternoon of your time." },
  { g: "B", bold: "FitScore 0–100.",                                 rest: " One number combining credit history, affordability, tenancy references, and ID integrity — with each component shown separately so you can see what tipped the score." },
  { g: "C", bold: "Every applicant shown, every time.",              rest: " Low scores aren't filtered out. The decision is yours to make — and the record proves it was yours." },
  { g: "D", bold: "30% affordability rule flagged automatically.",   rest: " No guessing what \"marginal\" means when income-to-rent gets close to the line." },
  { g: "E", bold: "Shortlist to signed lease — no re-typing.",       rest: " Accept an applicant and the debit order mandate, lease draft, and move-in inspection are queued for you." },
]

export default async function HomePage() {
  const content = await getSiteContent()

  // ── Dynamic dates (server-rendered; revalidated hourly via revalidate=3600) ─
  const now      = new Date()
  const prev     = new Date(now.getFullYear(), now.getMonth() - 1, 1) // 1st of last month
  const lastDay  = new Date(now.getFullYear(), now.getMonth(), 0)     // last day of last month
  const stmtMonLong  = prev.toLocaleString("en-ZA", { month: "long"  })   // "March"
  const stmtMonAbbr  = prev.toLocaleString("en-ZA", { month: "short" })   // "Mar"
  const stmtYear     = prev.getFullYear()
  const stmtMM       = String(prev.getMonth() + 1).padStart(2, "0")        // "03"
  const stmtSlug     = `${stmtYear}-${stmtMM}`                             // "2026-03"
  const lastDayDD    = String(lastDay.getDate()).padStart(2, "0")           // "31"
  const lastDayLabel = `${lastDayDD} ${stmtMonAbbr}`                       // "31 Mar"
  const todayLabel   = `${String(now.getDate()).padStart(2, "0")} ${now.toLocaleString("en-ZA", { month: "short" })} ${now.getFullYear()}`
  const auditLabel   = `${now.toLocaleString("en-ZA", { month: "short" })} ${now.getFullYear()}`

  return (
    <>
      {/* ── Notice strip ── */}
      <div className="pub-notice">
        <div className="pub-notice-inner pub-wrap">
          <div>
            <span className="pub-notice-dot" />
            {c(content, "notice")}
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <span style={{ color: "var(--ink-faint)" }}>Pleks · Western Cape, ZA</span>
            <Link href="/onboarding">Claim a seat →</Link>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="pub-hero">
        <RentRollSVG />
        <div className="pub-wrap">
          <div className="pub-hero-eyebrow">
            <span className="pub-chip">
              <svg className="pub-chip-glyph" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1 1.5 4v4.2C1.5 11.6 4.3 14.4 8 15c3.7-.6 6.5-3.4 6.5-6.8V4L8 1Zm0 2.2 4.5 2v3C12.5 10.6 10.5 12.7 8 13.3 5.5 12.7 3.5 10.6 3.5 8.2v-3L8 3.2Z"/>
              </svg>
              POPIA · RHA · CPA · EAAB — by default
            </span>
          </div>

          <h1 className="pub-display" style={{ margin: "0 0 28px", maxWidth: "22ch" }}>
            Rent collected. Landlords paid.{" "}
            <span className="amber-wash-underline">Deposits returned on the day.</span>
          </h1>

          <p className="pub-body-lg" style={{ maxWidth: "56ch", margin: "0 0 16px" }}>
            Pleks runs the boring half of South African property management — on the legal timetable, in the legal language, with the paperwork already filed before the question gets asked.
          </p>
          <p className="pub-body-lg" style={{ maxWidth: "56ch", margin: "0 0 40px" }}>
            Built across all three sides of the cycle: leases drafted and arrears chased on one side, contractor schedules and HOA approvals on the second, the rent roll and the trust account on the third.
          </p>

          <div className="pub-hero-ctas">
            <Link href="/onboarding" className="btn-pleks">
              {c(content, "hero_cta_primary")}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10m0 0L8.5 3.5M13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square"/>
              </svg>
            </Link>
            <Link href="/contact" className="btn-pleks ghost">
              {c(content, "hero_cta_secondary")}
            </Link>
            <Link href="/#artefact" style={{ fontSize: 13.5, color: "var(--ink-mute)", textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "var(--rule-strong)" }}>
              Or see what it produces
            </Link>
          </div>

          <div className="pub-hero-meta">
            {[
              { n: c(content, "hero_meta_1_n"), l: c(content, "hero_meta_1_l") },
              { n: c(content, "hero_meta_2_n"), l: c(content, "hero_meta_2_l") },
              { n: c(content, "hero_meta_3_n"), l: c(content, "hero_meta_3_l") },
            ].map((m) => (
              <div key={m.l} className="pub-hero-meta-item">
                <div className="n pub-tnum">{m.n}</div>
                <div className="l">{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider band ── */}
      <div className="pub-divider-band" aria-hidden="true">
        <svg viewBox="0 0 1440 84" preserveAspectRatio="none">
          <line x1="0" y1="42" x2="1440" y2="42" stroke="oklch(0.82 0.01 85)" strokeWidth="1" strokeDasharray="2 6"/>
          <g stroke="oklch(0.68 0.14 65)" strokeWidth="1.2">
            {[60,180,300,420,540,900,1020,1140,1260,1380].map(x => (
              <line key={x} x1={x} y1="36" x2={x} y2="48"/>
            ))}
          </g>
          <g fill="none" stroke="oklch(0.55 0.015 260)" strokeWidth="1.1" opacity="0.55">
            <path d="M100 60 L100 50 L115 42 L130 50 L130 60 Z"/>
            <path d="M200 60 L200 48 L212 40 L224 48 L236 40 L248 48 L248 60 Z"/>
            <path d="M360 60 L360 52 L372 44 L384 52 L384 60 Z"/>
            <rect x="640" y="44" width="80" height="16"/>
            <path d="M640 44 L680 28 L720 44"/>
            <rect x="820" y="46" width="40" height="14"/>
            <path d="M1080 60 L1080 50 L1094 42 L1108 50 L1108 60 Z"/>
          </g>
        </svg>
        <div className="pub-divider-stamp">
          <span className="d" />
          {`PLEKS · ERF 00417 · SURVEY ${new Date().getFullYear()}`}
        </div>
      </div>

      {/* ── Why Pleks ── */}
      <section id="why" className="pub-block" style={{ position: "relative", overflow: "hidden" }}>
        <div className="pub-wrap">
          <div className="pub-section-head" style={{ position: "relative" }}>
            <div>
              <div className="pub-eyebrow" style={{ marginBottom: 12 }}>
                <span className="amber-rule" />Why Pleks
              </div>
              <h2 className="pub-h1" style={{ maxWidth: "26ch", margin: 0 }}>
                Two things the others don&apos;t do. We built the{" "}
                <span className="amber-wash-underline">product around them.</span>
              </h2>
            </div>
            <p className="pub-body" style={{ maxWidth: "62ch" }}>{c(content, "why_sub")}</p>
            <IsometricBuildingsSVG />
          </div>

          <div className="pub-pillars">
            <div className="pub-pillar">
              <div className="pub-pillar-head">
                <div className="pub-pillar-kicker"><span className="num">01</span> RECORDS · KEPT</div>
                <h3>When the question gets asked, the answer is already on file.</h3>
                <p>Inspections remember when and where they were taken. The deposit clock tracks its own deadline. Every credit check is tied to the consent that allowed it. Every letter, every signed lease, every change to a unit is filed in the order it happened — and exported in one click when a Tribunal, an attorney, or a new staff member needs to see it.</p>
              </div>
              {PILLAR_1.map(item => (
                <div key={item.g} className="pub-pillar-item">
                  <span className="g">{item.g}</span>
                  <span><strong>{item.bold}</strong>{item.rest}</span>
                </div>
              ))}
            </div>

            <div className="pub-pillar">
              <div className="pub-pillar-head">
                <div className="pub-pillar-kicker"><span className="num">02</span> SCREENING · ECONOMICS</div>
                <h3>Applicants pay. You get a FitScore, not a 40-page credit report.</h3>
                <p>Applicants submit their details, consent, and pay for their own credit check directly. We run the bureau, ID, and deeds checks and hand you a single decision-ready number with a plain-English rationale attached. You don&apos;t pay for a check that goes nowhere. You don&apos;t read a credit report at 9pm on a Sunday.</p>
              </div>
              {PILLAR_2.map(item => (
                <div key={item.g} className="pub-pillar-item">
                  <span className="g">{item.g}</span>
                  <span><strong>{item.bold}</strong>{item.rest}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The Work ── */}
      <section id="artefact" className="pub-artefact">
        <div className="pub-wrap">
          <div className="pub-section-head" style={{ position: "relative" }}>
            <div>
              <div className="pub-eyebrow" style={{ marginBottom: 12 }}>
                <span className="amber-rule" />The work
              </div>
              <h2 className="pub-h1" style={{ maxWidth: "18ch", margin: 0 }}>
                What Pleks <span className="amber-wash-underline">puts on the page.</span>
              </h2>
            </div>
            <p className="pub-body" style={{ maxWidth: "62ch" }}>{c(content, "artefact_sub")}</p>
            <FitScoreSVG />
          </div>

          <div className="pub-artefact-frame">
            <div className="pub-artefact-tabs" role="tablist">
              <button className="pub-artefact-tab" type="button" aria-selected="true" role="tab"><span className="dot"/>Landlord statement</button>
              <button className="pub-artefact-tab" type="button" aria-selected="false" role="tab"><span className="dot"/>Applicant FitScore</button>
              <button className="pub-artefact-tab" type="button" aria-selected="false" role="tab"><span className="dot"/>Applicant fee receipt</button>
            </div>

            <div style={{ padding: 36, overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 36, paddingBottom: 28, borderBottom: "1px solid var(--rule-strong)", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink-mute)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>{`Landlord statement · ${stmtMonLong} ${stmtYear}`}</div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 28, letterSpacing: "-0.02em", fontWeight: 500 }}>Mrs. A. van Zyl</h3>
                  <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>17 Loop Street, Bo-Kaap, Cape Town, 8001 · Unit A (2B/1B) · Tenant: N. Dlamini</div>
                  <div style={{ fontFamily: "var(--pub-mono)", fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>{`ref · STMT-${stmtSlug}-A0417 · rent_roll R 13,500.00`}</div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--ink-mute)" }}>
                  <strong style={{ color: "var(--ink)", fontWeight: 500, display: "block" }}>Rox &amp; Co Property Management</strong>
                  {`PPRA FFC ${now.getFullYear()} · 2025-0041`}<br/>
                  Trust acc · ABSA 407 889 1204<br/>
                  {`Statement issued · ${todayLabel}`}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid var(--rule-strong)" }}>
                {([
                  { lbl: "Opening balance",      val: "R 0.00",      amber: false },
                  { lbl: "Receipts",             val: "R 13,500.00", amber: false },
                  { lbl: "Fees & disbursements", val: "−R 1,687.50", amber: false },
                  { lbl: "Payable to you",       val: "R 11,812.50", amber: true  },
                ] as const).map(cell => (
                  <div key={cell.lbl} style={{ padding: "20px 24px", borderRight: "1px solid var(--rule)", background: cell.amber ? "var(--amber-wash)" : undefined }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8 }}>{cell.lbl}</div>
                    <div style={{ fontSize: 22, fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums" }}>{cell.val}</div>
                  </div>
                ))}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24, fontSize: 13 }}>
                <thead>
                  <tr>
                    {(["Date","Description","Reference","Debit","Credit","Balance"] as const).map((h, i) => (
                      <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: "var(--ink-mute)", padding: "0 12px 12px", borderBottom: "1px solid var(--rule-strong)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { date: `01 ${stmtMonAbbr}`, desc: "Opening balance",                   ref: "—",                              debit: "—",        credit: "—",         bal: "0.00",       tag: null,    closing: false },
                    { date: `02 ${stmtMonAbbr}`, desc: "Rent received — debit order",        ref: `DO-M2431-${stmtMM}`,             debit: "—",        credit: "13,500.00", bal: "13,500.00",  tag: "rent",  closing: false },
                    { date: `02 ${stmtMonAbbr}`, desc: "Management fee (10%)",               ref: `FEE-0417-${stmtMM}`,             debit: "1,350.00", credit: "—",         bal: "12,150.00",  tag: "fee",   closing: false },
                    { date: `14 ${stmtMonAbbr}`, desc: "Geyser element — plumber invoice",   ref: "MX-8821",                        debit: "287.50",   credit: "—",         bal: "11,862.50",  tag: "maint", closing: false },
                    { date: `14 ${stmtMonAbbr}`, desc: "VAT on fee",                         ref: `VAT-0417-${stmtMM}`,             debit: "50.00",    credit: "—",         bal: "11,812.50",  tag: "vat",   closing: false },
                    { date: lastDayLabel,         desc: "Payable to landlord — pending EFT",  ref: `PAY-0417-${stmtMM}`,             debit: "—",        credit: "—",         bal: "11,812.50",  tag: null,    closing: true  },
                  ]).map((row) => (
                    <tr key={row.ref} style={{ background: row.closing ? "var(--paper-sunk)" : undefined }}>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--pub-mono)", fontSize: 12, color: "var(--ink-mute)" }}>{row.date}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", fontWeight: row.closing ? 600 : undefined }}>
                        {row.desc}
                        {row.tag && <span style={{ display: "inline-block", fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 3, background: "var(--paper-sunk)", border: "1px solid var(--rule)", color: "var(--ink-mute)", marginLeft: 8, fontFamily: "var(--pub-mono)" }}>{row.tag}</span>}
                      </td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--pub-mono)", fontSize: 12, color: "var(--ink-mute)" }}>{row.ref}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums" }}>{row.debit}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums" }}>{row.credit}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums", fontWeight: row.closing ? 600 : undefined }}>{row.bal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, paddingTop: 24, marginTop: 12, borderTop: "1px solid var(--rule)", fontSize: 11.5, color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--positive)" }}>●</span>{" "}
                  {`Trust reconciled ${lastDayLabel} 23:59 · ΔR0.00`}
                </div>
                <div>doc_hash · 0x 9b7c 2e01 4a3f · signed by Pleks</div>
                <div>audit entries #4780–#4811 · exportable</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Pleks Charter ── */}
      <section id="charter" className="pub-charter">
        <div className="pub-wrap">
          <div className="pub-section-head" style={{ position: "relative" }}>
            <div>
              <div className="pub-eyebrow" style={{ marginBottom: 12 }}>
                <span className="amber-rule" />The Pleks Charter
              </div>
              <h2 className="pub-h1" style={{ maxWidth: "32ch", margin: 0 }}>
                Your data is yours. Your landlord&apos;s money is theirs. We&apos;re just the{" "}
                <span className="amber-wash-underline">filing cabinet</span> — and it opens from both sides.
              </h2>
            </div>
            <p className="pub-body" style={{ maxWidth: "62ch" }}>
              Eight commitments we&apos;ve put in writing, not in marketing copy. Every one exists because the alternative has bitten someone in this industry. Every one is enforceable — by you, by your tenants, by the Information Regulator.
            </p>
            <VaultDoorSVG />
          </div>

          <ol className="pub-charter-grid">
            {([
              {
                num: "01 · TRUST MONEY",
                title: "We never hold your landlord's money.",
                body: "Client funds stay in your Section 86 trust account, at your own bank, under your own FFC. Pleks has no outbound payment rail — and the codebase can't grow one without rewriting the schema, the lint rules, and the UI layer.",
                foot: "Enforced at 4 layers · zero custodial authority by design",
              },
              {
                num: "02 · TENANT DATA",
                title: "We never hold your tenant's bank details either.",
                body: "Rent moves tenant-bank to your-bank on a mandate their bank holds against yours. We observe the reconciliation — we don't run the rail. If Pleks vanished tomorrow, the debit orders would keep running.",
                foot: "No inbound payment rail, either",
              },
              {
                num: "03 · PORTABILITY",
                title: "You can leave any month. We'll help you pack.",
                body: "Full export on demand — every lease, tenant, inspection photo with original EXIF, statement, mandate, audit entry. Signed, hashed, timestamped. No contract gate, no exit fee, no 'premium migration' tier. Your portfolio was always yours.",
                foot: "PDF + JSON + ZIP bundle · SHA-256 manifest hash",
              },
              {
                num: "04 · ACCESS CONTINUITY",
                title: "Overdue doesn't lock you out.",
                body: "If we ever need to chase you for an invoice, we'll chase the invoice. Nobody's rent roll becomes the collateral. You can see, export and migrate your data regardless of account state — contractually, not conditionally.",
                foot: "Written into every Operator agreement",
              },
              {
                num: "05 · RIGHT TO BE FORGOTTEN",
                title: "Your tenant's erasure request actually works.",
                body: "When a tenant asks to be forgotten, we execute it within 30 days — with the narrow statutory carve-outs (FICA 5 years, PPRA trust records, Tribunal holds) disclosed before they submit, not after. No silent retention, no 'anonymised' workaround.",
                foot: "Retention-aware cascade · carve-outs disclosed pre-submission",
              },
              {
                num: "06 · NO TRAINING, NO SELLING, NO TRACKING",
                title: "You're not a dataset. Your tenants aren't a dataset.",
                body: "Our AI provider runs zero-retention on every call: prompts and responses exist for the round-trip, then they're gone. We've deliberately not deployed Mixpanel, Amplitude, Google Analytics, or any other product-analytics vendor on the authenticated product.",
                foot: "Anthropic zero-retention DPA · no third-party analytics, ever",
              },
              {
                num: "07 · AGENCY ISOLATION",
                title: "Your applicants don't inherit another agency's history.",
                body: "FitScore uses that applicant's four declared inputs — affordability, credit, rental history, employment stability. Outcomes aren't pooled across agencies. Your judgement isn't diluted by someone else's mandate, and your book isn't leaked into someone else's model.",
                foot: "Zero cross-org data aggregation anywhere in the product",
              },
              {
                num: "08 · BREACH POSTURE",
                title: "If something goes wrong, you hear within 24 hours.",
                body: "POPIA gives us 72. We've committed to 24 in every Operator agreement, and we publish the post-mortem publicly. Your tenants' path to the Information Regulator is open and signposted on every privacy page — we don't get to stand between them and the complaint.",
                foot: "24-hour breach notification · IR escalation path always surfaced",
              },
            ] as const).map(item => (
              <li key={item.num} className="pub-charter-item">
                <div className="pub-charter-num">{item.num}</div>
                <h3 className="pub-charter-title">{item.title}</h3>
                <p className="pub-charter-body">{item.body}</p>
                <p className="pub-charter-foot">{item.foot}</p>
              </li>
            ))}
          </ol>

          <aside className="pub-charter-register">
            <div>
              <div className="pub-eyebrow" style={{ marginBottom: 10 }}><span className="amber-rule" />The long version, if you want it</div>
              <h3 className="reg-h3">The Processing-Purpose Register.</h3>
              <p className="reg-p">
                Every processing activity Pleks performs — who it touches, why, how long it stays, which third party sees it, on what legal basis. Version-controlled, publicly hosted, every change logged. Most SaaS companies keep this kind of document internal. We publish it.
              </p>
            </div>
            <div className="reg-right">
              <div className="pub-charter-stamp">
                <span className="v">v2026.1</span>
                <span>·</span>
                <span>Effective 2026-05-01</span>
                <span>·</span>
                <span className="hash">hash 0x7a2f…c4e1</span>
              </div>
              <a href="/privacy" className="pub-charter-cta">Read the register →</a>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Who built this ── */}
      <FounderSection />

      {/* ── Pricing ── */}
      <section id="pricing" className="pub-pricing">
        <div className="pub-wrap">
          <div className="pub-section-head" style={{ position: "relative" }}>
            <div>
              <div className="pub-eyebrow" style={{ marginBottom: 12 }}>
                <span className="amber-rule" />Pricing
              </div>
              <h2 className="pub-h1" style={{ maxWidth: "26ch", margin: 0 }}>
                One fee. <span className="amber-wash-underline">Written on the wall.</span> No per-user, per-check, per-SMS tax.
              </h2>
            </div>
            <p className="pub-body" style={{ maxWidth: "62ch" }}>{c(content, "pricing_sub")}</p>
            <PricingSVG />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", border: "1px solid var(--rule)", borderRadius: "var(--r-md)", background: "var(--paper-sunk)", marginBottom: 20, flexWrap: "wrap", fontSize: 14, color: "var(--ink-soft)" }}>
            <span style={{ fontFamily: "var(--pub-mono)", fontSize: 10.5, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid var(--amber)", color: "var(--amber-ink)", padding: "4px 12px", borderRadius: 3, flexShrink: 0 }}>Owner · free</span>
            <span>Managing your own rental? Pleks is free for a single lease, forever. No card, no trial clock.</span>
            <Link href="/onboarding" style={{ marginLeft: "auto", color: "var(--amber-ink)", borderBottom: "1px solid var(--amber)", paddingBottom: 1, fontSize: 13, whiteSpace: "nowrap" }}>Start as an owner →</Link>
          </div>

          <TierGrid tiers={TIERS} />

          <div className="pub-no-cliff">
            <span className="pub-no-cliff-label">No cliff</span>
            <p className="pub-no-cliff-body" style={{ margin: 0 }}>
              Pleks watches your active-lease count quietly in the background. When you cross a tier limit, we email you <em>and</em> your accountant <strong>30 days before</strong> your plan changes — with the new monthly amount and the date it kicks in. You can always switch back. <strong>Nothing auto-upgrades without notice.</strong> The line item on your bank statement is the line item on your bank statement — until you tell us otherwise.
            </p>
          </div>

          <div style={{ border: "1px solid var(--rule)", borderRadius: "var(--r-md)", background: "var(--paper-sunk)", padding: "28px 32px", marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Included in every tier</span>
              <span style={{ flex: 1, height: 1, background: "var(--rule)", minWidth: 32 }} />
              <span style={{ fontSize: 12, color: "var(--amber-ink)", fontFamily: "var(--pub-mono)" }}>No add-ons · No per-use fees</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0 24px" }}>
              {INCLUDED.map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", fontSize: 13, color: "var(--ink-soft)", borderBottom: "1px solid var(--rule)" }}>
                  <span style={{ color: "var(--amber-ink)", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="pub-eyebrow" style={{ marginBottom: 6 }}><span className="amber-rule" />A quick audit</div>
                <h3 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.015em", fontWeight: 500 }}>Where your current software bill goes.</h3>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", fontFamily: "var(--pub-mono)" }}>{`SA rental platforms · ${auditLabel}`}</div>
            </div>
            <div style={{ border: "1px solid var(--rule)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr>
                    {(["Line item","Industry standard","Pleks"] as const).map((h, i) => (
                      <th key={h} style={{ textAlign: "left", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: i === 2 ? "var(--ink)" : "var(--ink-mute)", padding: "14px 20px", borderBottom: i === 2 ? "2px solid var(--amber)" : "1px solid var(--rule-strong)", background: "var(--paper-sunk)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AUDIT_ROWS.map(row => (
                    <tr key={row.line}>
                      <td style={{ padding: "14px 20px", borderBottom: "1px solid var(--rule)", color: "var(--ink)", fontWeight: 500 }}>{row.line}</td>
                      <td style={{ padding: "14px 20px", borderBottom: "1px solid var(--rule)", color: "var(--ink-mute)" }}>{row.incumbent}</td>
                      <td style={{ padding: "14px 20px", borderBottom: "1px solid var(--rule)", color: "var(--amber-ink)", fontWeight: 600, background: "var(--amber-wash)" }}>{row.pleks}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: "18px 20px", background: "var(--ink)", color: "var(--paper)", fontWeight: 600 }}>Your software bill on the 1st</td>
                    <td style={{ padding: "18px 20px", background: "var(--ink)", color: "var(--ink-faint)" }}>Assembled from 4–6 line items · variable</td>
                    <td style={{ padding: "18px 20px", background: "var(--amber)", color: "var(--ink)", fontWeight: 600, fontSize: 15 }}>One number. Known 30 days ahead of any change.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "center", padding: "24px 28px", border: "1px solid var(--rule)", borderRadius: "var(--r-md)", background: "var(--paper-sunk)" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: "56ch" }}>
              <strong style={{ color: "var(--ink)" }}>If Pleks costs you more per month than what you&apos;re paying today, I want to know.</strong>{" "}
              I&apos;ll get on a call, walk the numbers with you, and if the maths doesn&apos;t land I&apos;ll tell you so myself — no form, no SDR.
            </p>
            <a href="mailto:stean@pleks.co.za" style={{ fontFamily: "var(--pub-mono)", fontSize: 13, color: "var(--ink)", borderBottom: "1px solid var(--rule-strong)", paddingBottom: 1, whiteSpace: "nowrap" }}>stean@pleks.co.za</a>
          </div>
        </div>
      </section>

      {/* ── Divider 2 (into founding) ── */}
      <div className="pub-divider-band" aria-hidden="true" style={{ background: "linear-gradient(180deg, var(--paper) 0%, oklch(0.96 0.016 70) 50%, oklch(0.20 0.018 265) 100%)" }}>
        <svg viewBox="0 0 1440 84" preserveAspectRatio="none">
          <line x1="0" y1="42" x2="1440" y2="42" stroke="oklch(0.82 0.01 85)" strokeWidth="1" strokeDasharray="2 6"/>
          <g stroke="oklch(0.68 0.14 65)" strokeWidth="1.2">
            {[120,320,520,720,920,1120,1320].map(x => (
              <line key={x} x1={x} y1="36" x2={x} y2="48"/>
            ))}
          </g>
        </svg>
        <div className="pub-divider-stamp" style={{ borderColor: "oklch(0.68 0.14 65 / 0.5)", color: "var(--amber-ink)" }}>
          <span className="d" />{" "}
          FOUNDING AGENTS · 2026 COHORT
        </div>
      </div>

      {/* ── Founding agent CTA ── */}
      <section id="founding" style={{
        background: "radial-gradient(ellipse at 15% 0%, oklch(0.32 0.09 65) 0%, transparent 55%), radial-gradient(ellipse at 95% 100%, oklch(0.28 0.06 45) 0%, transparent 50%), linear-gradient(180deg, oklch(0.20 0.018 265) 0%, oklch(0.15 0.012 260) 100%)",
        padding: "88px 0",
        position: "relative",
        overflow: "hidden",
      }}>
        <div className="pub-wrap" style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 48, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: "0 0 12px", fontSize: "clamp(26px, 3vw, 36px)", lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 500, color: "oklch(0.95 0.005 85)", maxWidth: "20ch" }}>
                {c(content, "founding_heading")}
              </h2>
              <p style={{ margin: 0, color: "oklch(0.75 0.01 260)", maxWidth: "48ch", fontSize: 15 }}>
                {c(content, "founding_sub")}
              </p>
              <div style={{ fontFamily: "var(--pub-mono)", fontSize: 12, color: "oklch(0.60 0.01 260)", display: "flex", gap: 10, alignItems: "center", marginTop: 18 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", display: "inline-block", flexShrink: 0 }} />
                {c(content, "founding_counter")}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href="/onboarding" className="btn-pleks" style={{ "--btn-bg": "var(--amber)", "--btn-fg": "var(--ink)", "--btn-bar": "var(--ink)", justifyContent: "center" } as React.CSSProperties}>
                Claim a founding seat
              </Link>
              <Link href="/contact" className="btn-pleks ghost" style={{ color: "oklch(0.95 0.005 85)", borderColor: "oklch(1 0 0 / 0.18)", justifyContent: "center" }}>
                Or book a demo first
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
