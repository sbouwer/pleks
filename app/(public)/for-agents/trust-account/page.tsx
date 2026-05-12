/**
 * app/(public)/for-agents/trust-account/page.tsx — Sovereign trust account marketing page
 *
 * Route:  /for-agents/trust-account
 * Auth:   none — public, unauthenticated, SEO-indexed
 * Notes:  Explains the sovereign model. No competitor names (legal safety).
 *         See brief/legal/TRUST_ACCOUNT_POSITIONING.md for the doctrine.
 */

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Check, ShieldCheck, Lock, FileText, BarChart3 } from "lucide-react"

export const metadata = {
  title: "Your Trust Account, Your Rules | Pleks",
  description:
    "Pleks manages your trust account without touching it. Monthly reconciliation, PPRA-format audit exports, and full landlord transparency — all while your FFC stays with you.",
}

function TrustVaultSVG() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Outer vault door */}
      <rect x="80" y="40" width="240" height="240" rx="16" stroke="var(--brand)" strokeOpacity={0.35} strokeWidth={1.5} />
      {/* Inner vault ring */}
      <circle cx="200" cy="160" r="90" stroke="var(--brand)" strokeOpacity={0.18} strokeWidth={1} />
      <circle cx="200" cy="160" r="70" stroke="var(--brand)" strokeOpacity={0.12} strokeWidth={1} />
      {/* Lock bolts */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180
        const x1 = 200 + Math.cos(rad) * 70
        const y1 = 160 + Math.sin(rad) * 70
        const x2 = 200 + Math.cos(rad) * 90
        const y2 = 160 + Math.sin(rad) * 90
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--brand)" strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" />
      })}
      {/* Central handle */}
      <circle cx="200" cy="160" r="24" stroke="var(--brand)" strokeOpacity={0.6} strokeWidth={1.5} />
      <circle cx="200" cy="160" r="10" fill="var(--brand)" fillOpacity={0.25} stroke="var(--brand)" strokeOpacity={0.5} strokeWidth={1} />
      {/* Agency label line */}
      <line x1="120" y1="260" x2="280" y2="260" stroke="var(--brand)" strokeOpacity={0.2} strokeWidth={1} />
      <line x1="145" y1="272" x2="255" y2="272" stroke="var(--brand)" strokeOpacity={0.12} strokeWidth={1} />
      {/* Pleks badge — top right corner */}
      <rect x="275" y="48" width="36" height="16" rx="4" fill="var(--brand)" fillOpacity={0.15} stroke="var(--brand)" strokeOpacity={0.3} strokeWidth={0.8} />
      <line x1="282" y1="56" x2="304" y2="56" stroke="var(--brand)" strokeOpacity={0.5} strokeWidth={1.5} />
    </svg>
  )
}

const sovereignProperties = [
  {
    icon: Lock,
    title: "Your bank, your mandate",
    body: "Your trust account is at your bank, in your name, with your mandate. Pleks reads from it and helps you reconcile it — nothing more.",
  },
  {
    icon: ShieldCheck,
    title: "Your FFC stays with you",
    body: "Your Fidelity Fund Certificate is your licence to practice. It attests to your trust account compliance. Pleks doesn't touch your FFC relationship with the PPRA.",
  },
  {
    icon: FileText,
    title: "Your audit export, instantly",
    body: "Monthly close generates a PPRA-format PDF and XLSX your auditor can use directly — cover page, reconciliation, transaction register, deposits held, management fees.",
  },
  {
    icon: BarChart3,
    title: "Zero payment initiation",
    body: "Pleks cannot move a cent. No bank credentials. No payment rail. No outbound EFTs. If someone compromises Pleks, there is nothing to initiate.",
  },
]

const operationalItems = [
  "Upload your bank statement (OFX, CSV, or QIF) — or connect a read-only bank feed",
  "The matching engine reconciles statement lines to your trust ledger automatically",
  "Review unmatched items in the reconciliation queue",
  "Compare three balances: bank closing, ledger closing, and recon-computed closing",
  "Sign off — generates an immutable signed period and an audit-ready export bundle",
  "Landlords see their tenant deposits in their own portal view",
]

const ppraPoints = [
  "The Property Practitioners Act 22 of 2019 (s54, s86) expects agencies to operate their own trust accounts",
  "The PPRA issues FFCs to the agency — not to any software platform",
  "Forced-trusteeship by a third party is a commercial arrangement, not a regulatory requirement",
  "Pleks's monthly close + audit export satisfies what the PPRA auditor wants to see",
]

export default function TrustAccountPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
        <p className="text-sm font-medium text-brand mb-4 tracking-wide uppercase">Sovereign trust account</p>
        <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
          Your trust account.<br />Your FFC.<br />Your bank relationship.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Pleks doesn&apos;t hold your client funds. You do — exactly like the PPRA requires.
          We help you run the reconciliation, generate the audit export, and show landlords what&apos;s held on their behalf.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" render={<Link href="/register" />}>
            Get started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" size="lg" render={<Link href="/for-agents" />}>
            See all features
          </Button>
        </div>
      </section>

      {/* SVG illustration */}
      <section className="mx-auto max-w-sm px-6 pb-12">
        <TrustVaultSVG />
      </section>

      {/* Section 1 — what the sovereign model means */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl font-bold mb-4">What &ldquo;sovereign&rdquo; actually means</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Four properties that make the model real — not marketing.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {sovereignProperties.map((item) => (
            <div key={item.title} className="rounded-xl border border-border/60 bg-surface-elevated p-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <item.icon className="h-5 w-5 text-brand" />
                </div>
                <div>
                  <p className="font-semibold mb-1">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2 — operational workflow */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="font-heading text-3xl font-bold mb-4 text-center">Monthly close in 6 steps</h2>
          <p className="text-muted-foreground text-center mb-10">
            From bank statement to signed-off audit export — no spreadsheets, no manual formatting.
          </p>
          <ol className="space-y-4">
            {operationalItems.map((item, i) => (
              <li key={item} className="flex items-start gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-xs font-semibold text-brand">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground pt-1">{item}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Section 3 — the alternative */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="font-heading text-3xl font-bold mb-4">The alternative — and why it costs more</h2>
        <p className="text-muted-foreground mb-6">
          Some platforms run your trust account on your behalf. Your client funds live in their bank account.
          It&apos;s operationally convenient, but it comes with real costs:
        </p>
        <ul className="space-y-3 mb-8">
          {[
            "You pay a custody fee on top of the software fee",
            "Your client funds are exposed to your software provider's risk",
            "Migrating away means moving thousands of tenant deposits — months of work",
            "A problem at their end is your problem too",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="text-warning mt-0.5 shrink-0">—</span>
              {item}
            </li>
          ))}
        </ul>
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-5">
          <p className="font-semibold text-foreground mb-1">Pleks doesn&apos;t do that.</p>
          <p className="text-sm text-muted-foreground">
            Your money stays with you. Our software reads your bank statements, reconciles them to your
            ledger, and produces the audit artefacts your PPRA auditor needs. We never touch the account itself.
          </p>
        </div>
      </section>

      {/* Section 4 — pricing */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-heading text-3xl font-bold mb-4">Why Pleks is ~15× cheaper</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            Platforms that take custody of your trust account need to fund a trust-audit-and-custody
            compliance engine. You&apos;re paying for that engine — even if you never needed it.
          </p>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Pleks doesn&apos;t run that engine because we&apos;re not your trustee. You already have a bank account
            and an FFC. We help you use them better.
          </p>
          <Button variant="outline" render={<Link href="/pricing" />}>
            See pricing <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Section 5 — PPRA compliance */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="font-heading text-3xl font-bold mb-4">Is this PPRA compliant?</h2>
        <p className="text-muted-foreground mb-6">Yes — and here is why:</p>
        <ul className="space-y-3 mb-8">
          {ppraPoints.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Pleks produces the monthly reconciliation record and PPRA-format audit export your FFC auditor
          expects. The agency principal signs off the period — because it is their professional-liability act,
          not ours.
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="font-heading text-3xl font-bold mb-4">Keep your trust account. Keep your FFC.</h2>
        <p className="text-muted-foreground mb-8">
          Start your Pleks trial — no credit card required. Your first month-end close is included.
        </p>
        <Button size="lg" render={<Link href="/register" />}>
          Get started free <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </section>

    </div>
  )
}
