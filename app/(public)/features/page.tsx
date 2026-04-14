import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  UserCheck, Wrench, ClipboardCheck, CreditCard, FileText,
  Wallet, BarChart3, Landmark, Building2, Zap, Shield, Users,
} from "lucide-react"

const FEATURES = [
  {
    icon: UserCheck,
    title: "FitScore applicant screening",
    description: "Applicants pay R399 for their own credit check — you see a 0–100 FitScore with income, credit, TPN profile, and employment. No per-check cost to you.",
    tier: "Free",
  },
  {
    icon: CreditCard,
    title: "DebiCheck collections",
    description: "DebiCheck mandate created alongside the lease. Automatic debit orders each month — no manual collection, no chasing.",
    tier: "Starter",
  },
  {
    icon: FileText,
    title: "Digital lease signing",
    description: "DocuSeal-powered lease generation and e-signature. Templates include RHA-compliant clauses, annexures, and house rules.",
    tier: "Free",
  },
  {
    icon: ClipboardCheck,
    title: "Inspection PWA",
    description: "Mobile-first inspection tool with room-by-room condition capture, photo upload, and tenant signature. Generates a PDF report.",
    tier: "Starter",
  },
  {
    icon: Wrench,
    title: "Maintenance & work orders",
    description: "Log, triage, and assign maintenance requests. Contractors receive a token link — no login needed — to acknowledge, update status, submit quotes, and send invoices.",
    tier: "Starter",
  },
  {
    icon: Wallet,
    title: "Deposit management",
    description: "Deposit receipts, interest calculations at prime rate, tenant-disputed deductions with justification narratives. Tribunal-ready from day one.",
    tier: "Free",
  },
  {
    icon: Building2,
    title: "Municipal bill extraction",
    description: "Upload a PDF municipal bill and Pleks extracts all charges — rates, water, electricity, sewerage, VAT — in seconds. Track spend per property over time.",
    tier: "Starter",
  },
  {
    icon: BarChart3,
    title: "Owner statements",
    description: "SARS-aligned monthly and annual statements for property owners. Shareable via secure token link — no owner login required.",
    tier: "Portfolio",
  },
  {
    icon: Users,
    title: "Arrears automation",
    description: "Structured arrears sequences with pre-drafted demand letters, section notices, and Tribunal bundle export. Covers COJ, NHBRC, and general RHA processes.",
    tier: "Portfolio",
  },
  {
    icon: Landmark,
    title: "HOA & body corporate",
    description: "Manage levy schedules, AGM minutes, owner registers, and scheme rules for sectional title and homeowners associations.",
    tier: "Portfolio",
  },
  {
    icon: Zap,
    title: "Heritage building support",
    description: "Track grading, permit expiry, maintenance schedules, and SAHRA notifications for heritage-listed properties.",
    tier: "Firm",
  },
  {
    icon: Shield,
    title: "POPIA compliance built in",
    description: "Applicant consent logs, purpose-limited data collection, subject access request support, and full audit trail on every state change.",
    tier: "Free",
  },
]

const TIER_COLOURS: Record<string, string> = {
  Free: "bg-success/10 text-success",
  Starter: "bg-brand/10 text-brand",
  Portfolio: "bg-info/10 text-info",
  Firm: "bg-warning/10 text-warning",
}

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-16 space-y-16">

        {/* Header */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Features</p>
          <h1 className="font-heading text-4xl sm:text-5xl leading-tight">
            Everything SA property management actually needs
          </h1>
          <p className="text-muted-foreground text-lg">
            Built by someone who has managed SA rental portfolios for over 11 years.
            Not adapted from a UK or US product.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button render={<Link href="/register" />} size="lg">
              Start free — 1 unit
            </Button>
            <Button render={<Link href="/pricing" />} variant="outline" size="lg">
              See pricing
            </Button>
          </div>
        </div>

        {/* Tier legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
          <span className="text-muted-foreground">Included on:</span>
          {Object.entries(TIER_COLOURS).map(([tier, cls]) => (
            <span key={tier} className={`px-2.5 py-1 rounded-full font-semibold ${cls}`}>
              {tier}
            </span>
          ))}
        </div>

        {/* Feature grid — 2-col compact on mobile, 2-col sm, 3-col lg */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="rounded-xl border border-border/60 bg-card px-3 py-3 sm:px-5 sm:py-5 space-y-2 sm:space-y-3 hover:border-brand/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="rounded-lg bg-surface-elevated p-2 sm:p-2.5 shrink-0">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-brand" />
                  </div>
                  <span className={`text-[10px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-full ${TIER_COLOURS[f.tier]}`}>
                    {f.tier}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-xs sm:text-sm mb-0.5 sm:mb-1">{f.title}</p>
                  {/* Description hidden on mobile — icon + title sufficient in 2-col grid */}
                  <p className="hidden sm:block text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="rounded-2xl border border-border/60 bg-card px-8 py-10 text-center space-y-4">
          <h2 className="font-heading text-2xl">Ready to switch?</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Start with one unit for free. No credit card. No time limit on the free tier.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button render={<Link href="/register" />}>
              Create free account
            </Button>
            <Button render={<Link href="/pricing" />} variant="outline">
              Compare plans
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
