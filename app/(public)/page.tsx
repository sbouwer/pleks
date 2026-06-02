/**
 * app/(public)/page.tsx — marketing homepage
 *
 * Route:  /
 * Auth:   public
 * Data:   getSiteContent() reads editable copy from Supabase; revalidated hourly.
 * Notes:  Server Component — interactive tab frame is extracted to WorkTabsClient.
 */
import { getSiteContent } from "@/lib/supabase/public"
import Link from "next/link"
import { TierGrid } from "./TierGrid"
import { TIERS } from "@/lib/marketing/tiers"
import { RentRollSVG }           from "./svgs/RentRollSVG"
import { IsometricBuildingsSVG } from "./svgs/IsometricBuildingsSVG"
import { FitScoreSVG }            from "./svgs/FitScoreSVG"
import { PricingSVG }             from "./svgs/PricingSVG"
import { FounderSection }         from "@/components/marketing/founder/FounderSection"
import { WorkTabsClient }         from "./WorkTabsClient"
import { CharterSection }         from "@/components/marketing/charter/CharterSection"

export const revalidate = 3600

export const metadata = {
  title: "Pleks — SA Property Management, Built Right",
  description: "Built across all three sides of the property cycle: legal, development, management. Applicant-paid FitScore screening. Bank reconciliation that catches every payment. Tribunal-ready documentation by default.",
}

const DEFAULTS: Record<string, string> = {
  notice:             "Founding-agent cohort now open — seven seats remaining",
  hero_cta_primary:   "Start free — 1 unit, no card",
  hero_cta_secondary: "See the demo",
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


// Cross-subdomain links — absolute URLs prevent RSC prefetch CORS failures
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.pleks.co.za"

const AUDIT_ROWS = [
  { line: "Platform · per-user fee",            min: 400,   max: 800,   unit: "per user / mo",            pleks: "Included",            pleksNote: "whole team, no per-user fee"          },
  { line: "Credit & background checks",         min: 70,    max: 200,   unit: "per applicant",            pleks: "Applicant pays",      pleksNote: "never lands on your account"          },
  { line: "SMS & WhatsApp notifications",       min: 0.35,  max: 0.60,  unit: "per message · metered",    pleks: "Included",            pleksNote: "unlimited tenant comms"               },
  { line: "Trust-account module",               min: 300,   max: 600,   unit: "/ mo · add-on",             pleks: "Included",            pleksNote: "reconciles nightly, no extra cost"    },
  { line: "Inspection app",                     min: 250,   max: 400,   unit: "/ mo · add-on",             pleks: "Included",            pleksNote: "iOS + Android, offline-capable"       },
  { line: "E-signature",                        min: 15,    max: 45,    unit: "per lease signed",         pleks: "Included",            pleksNote: "every lease, every addendum"          },
  { line: "Bank-feed / accounting integration", min: 200,   max: 350,   unit: "/ mo",                     pleks: "Included",            pleksNote: "Xero + Sage export"                   },
  { line: "Onboarding & data migration",        min: 3500,  max: 8000,  unit: "once-off",                 pleks: "Free",                pleksNote: "we do the import for you"             },
  { line: "AI-drafted Tribunal bundle",         min: null,  max: null,  unit: "Not offered · manual",     pleks: "Included",            pleksNote: "every dispute, court-ready"           },
] as const

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
            <a href={`${APP_URL}/onboarding`}>Claim a seat →</a>
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

          <h1 className="pub-display" style={{ margin: "0 0 28px", maxWidth: "28ch" }}>
            Rent collected. Landlords paid. Deposits returned on the day.
          </h1>

          <p className="pub-body-lg" style={{ maxWidth: "56ch", margin: "0 0 16px" }}>
            Pleks runs{" "}
            <span className="amber-wash-underline">the boring half</span>{" "}
            of South African property management — on the legal timetable, in the legal language, with the paperwork already filed before the question gets asked.
          </p>
          <p className="pub-body-lg" style={{ maxWidth: "56ch", margin: "0 0 40px" }}>
            Built across all three sides of the cycle: leases drafted and arrears chased on one side, contractor schedules and HOA approvals on the second, the rent roll and the trust account on the third.
          </p>

          <div className="pub-hero-ctas">
            <a href={`${APP_URL}/onboarding`} className="btn-pleks">
              {c(content, "hero_cta_primary")}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10m0 0L8.5 3.5M13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square"/>
              </svg>
            </a>
            <Link href="/demo" className="btn-pleks ghost">
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
                <div className="pub-pillar-kicker"><span className="num">01 ·</span> RECORDS · KEPT</div>
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

          <WorkTabsClient
            stmtMonLong={stmtMonLong}
            stmtYear={stmtYear}
            stmtMM={stmtMM}
            stmtSlug={stmtSlug}
            lastDayLabel={lastDayLabel}
            todayLabel={todayLabel}
            auditLabel={auditLabel}
            nowYear={now.getFullYear()}
          />
        </div>
      </section>

      {/* ── The Pleks Charter ── */}
      <CharterSection />

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
            <a href={`${APP_URL}/onboarding`} style={{ marginLeft: "auto", color: "var(--amber-ink)", borderBottom: "1px solid var(--amber)", paddingBottom: 1, fontSize: 13, whiteSpace: "nowrap" }}>Start as an owner →</a>
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
              <span style={{ fontSize: 14, fontWeight: 600 }}>Included in every paid tier</span>
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
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                <colgroup>
                  <col style={{ width: "27%" }} />{/* line item */}
                  <col style={{ width: "3%"  }} />{/* min: R */}
                  <col style={{ width: "8%"  }} />{/* min: number */}
                  <col style={{ width: "3%"  }} />{/* max: R */}
                  <col style={{ width: "8%"  }} />{/* max: number */}
                  <col style={{ width: "16%" }} />{/* unit / note */}
                  <col style={{ width: "35%" }} />{/* pleks */}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left",  fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: "var(--ink-mute)", padding: "12px 18px", borderBottom: "1px solid var(--rule-strong)", background: "var(--paper-sunk)" }}>Line item</th>
                    <th style={{ textAlign: "left",  fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: "var(--ink-mute)", padding: "12px 0 12px 18px", borderBottom: "1px solid var(--rule-strong)", background: "var(--paper-sunk)" }} colSpan={5}>Industry standard</th>
                    <th style={{ textAlign: "left",  fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: "var(--ink)",      padding: "12px 18px", borderBottom: "2px solid var(--amber)",        background: "var(--paper-sunk)" }}>Pleks</th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT_ROWS.map(row => {
                    const fmtNum = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    return (
                      <tr key={row.line}>
                        <td style={{ padding: "11px 18px", borderBottom: "1px solid var(--rule)", color: "var(--ink)", fontWeight: 500 }}>{row.line}</td>
                        {row.min === null || row.max === null ? (
                          <td colSpan={5} style={{ padding: "11px 18px", borderBottom: "1px solid var(--rule)", color: "var(--ink-mute)", fontStyle: "italic", fontSize: 13 }}>{row.unit}</td>
                        ) : (
                          <>
                            <td style={{ padding: "11px 0 11px 18px", borderBottom: "1px solid var(--rule)", color: "var(--ink-faint)", textAlign: "right", fontFamily: "var(--pub-mono)" }}>R</td>
                            <td style={{ padding: "11px 12px 11px 6px", borderBottom: "1px solid var(--rule)", color: "var(--ink-mute)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtNum(row.min)}</td>
                            <td style={{ padding: "11px 0",            borderBottom: "1px solid var(--rule)", color: "var(--ink-faint)", textAlign: "right", fontFamily: "var(--pub-mono)" }}>R</td>
                            <td style={{ padding: "11px 12px 11px 6px", borderBottom: "1px solid var(--rule)", color: "var(--ink-mute)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtNum(row.max)}</td>
                            <td style={{ padding: "11px 14px 11px 8px", borderBottom: "1px solid var(--rule)", color: "var(--ink-faint)", fontSize: 12.5, fontFamily: "var(--pub-mono)", whiteSpace: "nowrap" }}>{row.unit}</td>
                          </>
                        )}
                        <td style={{ padding: "11px 18px", borderBottom: "1px solid var(--rule)", background: "var(--amber-wash)", whiteSpace: "nowrap" }}>
                          <span style={{ color: "var(--amber-ink)", fontWeight: 600, fontSize: 14 }}>{row.pleks}</span>
                          <span style={{ color: "var(--ink-soft)", fontSize: 12.5, marginLeft: 10 }}>{row.pleksNote}</span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td style={{ padding: "16px 18px", background: "var(--ink)", color: "var(--paper)", fontWeight: 600 }}>Your software bill on the 1st</td>
                    <td colSpan={5} style={{ padding: "16px 18px", background: "var(--ink)", color: "var(--ink-faint)" }}>Assembled from 4–6 line items · variable each month</td>
                    <td style={{ padding: "16px 18px", background: "var(--amber)", color: "var(--ink)", fontWeight: 600, fontSize: 15 }}>One number. Known 30 days ahead of any change.</td>
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
            <a href={`${MARKETING_URL}/contact`} className="btn-pleks ghost" style={{ whiteSpace: "nowrap" }}>
              Get in touch →
            </a>
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
              <a href={`${APP_URL}/onboarding`} className="btn-pleks" style={{ "--btn-bg": "var(--amber)", "--btn-fg": "var(--ink)", "--btn-bar": "var(--ink)", justifyContent: "center" } as React.CSSProperties}>
                Claim a founding seat
              </a>
              <Link href="/demo" className="btn-pleks ghost" style={{ color: "oklch(0.95 0.005 85)", borderColor: "oklch(1 0 0 / 0.18)", justifyContent: "center" }}>
                View the demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
