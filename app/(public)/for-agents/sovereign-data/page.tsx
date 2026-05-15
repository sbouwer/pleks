/**
 * app/(public)/for-agents/sovereign-data/page.tsx — Sovereign data marketing page
 *
 * Route:  /for-agents/sovereign-data
 * Auth:   none — public, unauthenticated, SEO-indexed
 * Notes:  D-POPIA-20: sibling to /for-agents/trust-account (BUILD_64).
 *         Together they are the Pleks compliance moat: "your client money stays with you"
 *         + "your client data stays with you." No competitor names (legal safety).
 */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Lock, Shield, FileText, Users, Eye, CheckCircle2 } from "lucide-react"

export const metadata = {
  title: "Your Client Data, Under Your Control | Pleks",
  description:
    "Pleks manages your POPIA obligations without owning your client data. 30-day SLA enforcement, transparent retention schedules, and subject-access dashboards — all while your clients' data stays with you.",
}

const sovereignProperties = [
  {
    icon: Shield,
    title: "You are the Responsible Party",
    body: "Your tenants, landlords, and contractors gave their data to your agency — not to Pleks. Pleks is your Operator: we process data on your behalf, under your authority.",
  },
  {
    icon: Lock,
    title: "Their rights flow to you",
    body: "When a tenant exercises a POPIA right — access, correction, erasure — they exercise it against your agency. Pleks provides the inbox, the workflow, and the execution layer. The authority is yours.",
  },
  {
    icon: Eye,
    title: "Full retention transparency",
    body: "Every data category is retained for exactly as long as the law requires: 5 years for trust records (PPRA), 3 years for inspection photos (RHA), 12 months for rejected applications (POPIA minimisation). No longer.",
  },
  {
    icon: FileText,
    title: "Exportable, deletable, yours",
    body: "Any tenant can request a copy of their data in PDF + JSON format. Any tenant can request deletion of everything we're legally allowed to delete — with explicit pre-submission disclosure of what can't be deleted and why.",
  },
  {
    icon: Users,
    title: "Immutable consent audit trail",
    body: "Every consent event is permanently logged with the exact policy text in effect at the time. Subjects can see every consent they've given, across every agency relationship, in one place.",
  },
  {
    icon: CheckCircle2,
    title: "30-day SLA, enforced",
    body: "POPIA gives subjects 30 days to receive a response. Your compliance dashboard shows open requests, SLA countdowns, and overdue alerts — so you never miss a deadline.",
  },
]

export default function SovereignDataPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-20 pb-16 text-center space-y-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          POPIA compliance · Sovereign data
        </p>
        <h1 className="text-4xl md:text-5xl font-heading font-semibold leading-tight">
          Your client data,<br />
          <span className="text-[var(--brand)]">under your control.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Pleks handles POPIA compliance without owning your client relationships. Every right,
          every request, every deletion — your agency&apos;s authority, our infrastructure.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button render={<Link href="/signup" />} size="lg">
            Start free <ArrowRight className="ml-2 size-4" />
          </Button>
          <Button variant="outline" render={<Link href="/for-agents/trust-account" />} size="lg">
            Sovereign trust account
          </Button>
        </div>
      </section>

      {/* The doctrine */}
      <section className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="border rounded-xl p-6 md:p-8 bg-muted/20 space-y-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">The doctrine</p>
          <blockquote className="text-xl font-medium leading-snug">
            &ldquo;Pleks processes your client data on your behalf. The authority stays with your
            agency. The compliance infrastructure stays with Pleks. The data never crosses the
            line between the two.&rdquo;
          </blockquote>
          <p className="text-sm text-muted-foreground">
            This is the POPIA expression of the same principle behind our{" "}
            <Link href="/for-agents/trust-account" className="underline">sovereign trust account</Link>{" "}
            stance. Just as Pleks is not the trustee of your client funds, Pleks is not the
            Responsible Party for your client data. We are your Operator — processing on your
            instructions, under your oversight.
          </p>
        </div>
      </section>

      {/* Properties grid */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-6">
          {sovereignProperties.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4 p-5 border rounded-xl">
              <div className="shrink-0">
                <div className="size-9 rounded-lg bg-[var(--brand)]/10 flex items-center justify-center">
                  <Icon className="size-4 text-[var(--brand)]" />
                </div>
              </div>
              <div>
                <p className="font-medium text-sm mb-1">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Legal grounding */}
      <section className="max-w-3xl mx-auto px-4 py-12 space-y-4">
        <h2 className="text-xl font-semibold">Grounded in POPIA</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            The Protection of Personal Information Act (POPIA) distinguishes between the
            <strong className="text-foreground"> Responsible Party</strong> — the entity that
            determines why and how personal information is processed — and the
            <strong className="text-foreground"> Operator</strong> — the entity that processes
            data on behalf of the Responsible Party.
          </p>
          <p>
            Your agency is the Responsible Party for your tenants&apos; data. Pleks is your
            Operator. This means: your clients&apos; POPIA rights flow to your agency; Pleks
            assists you in exercising those rights within 30 days; Pleks never holds your
            clients&apos; data as a principal.
          </p>
          <p>
            The same discipline that keeps your trust account at your bank keeps your
            client data in your agency&apos;s control — Pleks is the management layer, not
            the custodian.
          </p>
        </div>
        <div className="flex gap-4 flex-wrap pt-2">
          <Link href="/privacy/processing-purposes" className="text-sm underline text-muted-foreground hover:text-foreground">
            Processing purposes register
          </Link>
          <Link href="/privacy" className="text-sm underline text-muted-foreground hover:text-foreground">
            Privacy policy
          </Link>
          <Link href="/privacy/information-officer" className="text-sm underline text-muted-foreground hover:text-foreground">
            Information Officer
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-2xl font-heading font-semibold">
          POPIA compliance without the complexity
        </h2>
        <p className="text-muted-foreground">
          Your clients&apos; data subject requests handled through a structured inbox. 30-day SLA
          tracking. Automated retention enforcement. Immutable consent records.
        </p>
        <Button render={<Link href="/signup" />} size="lg">
          Get started free <ArrowRight className="ml-2 size-4" />
        </Button>
      </section>
    </div>
  )
}
