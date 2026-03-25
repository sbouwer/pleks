import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Wallet, CalendarCheck, ShieldCheck, ArrowRight, ArrowDown } from "lucide-react"
import { formatZAR, FOUNDING_AGENT_PRICE_CENTS } from "@/lib/constants"
import { FeatureExplorer } from "@/components/marketing/FeatureExplorer"
import { CostComparison } from "@/components/marketing/CostComparison"
import { ProductPreview } from "@/components/marketing/ProductPreview"

export const metadata = {
  title: "Pleks — SA Property Management, Built Right",
  description: "Every corner of this product was designed by someone who has done the work — inspections, arrears, HOA setup, Tribunal. Built for how property management actually works in South Africa.",
}

function IsometricBuildings() {
  return (
    <svg viewBox="0 0 400 340" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Ground grid */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={`gx${i}`} x1={60 + i * 56} y1={280} x2={120 + i * 56} y2={310} stroke="var(--brand)" strokeOpacity={0.08} strokeWidth={0.5} />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={`gy${i}`} x1={340 - i * 56} y1={280} x2={280 - i * 56} y2={310} stroke="var(--brand)" strokeOpacity={0.08} strokeWidth={0.5} />
      ))}

      {/* Building 1 — tall, back left */}
      <g opacity={0.15}>
        <path d="M100,100 L160,70 L220,100 L220,260 L160,290 L100,260 Z" stroke="var(--brand)" strokeWidth={1} />
        <path d="M160,70 L160,290" stroke="var(--brand)" strokeWidth={0.5} />
        <path d="M100,100 L160,130 L220,100" stroke="var(--brand)" strokeWidth={0.5} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`b1f${i}`} x1={100} y1={130 + i * 22} x2={160} y2={160 + i * 22} stroke="var(--brand)" strokeWidth={0.3} />
        ))}
      </g>

      {/* Building 2 — medium, mid right */}
      <g opacity={0.5}>
        <path d="M180,150 L240,120 L300,150 L300,270 L240,300 L180,270 Z" stroke="var(--brand)" strokeWidth={1.2} />
        <path d="M240,120 L240,300" stroke="var(--brand)" strokeWidth={0.5} />
        <path d="M180,150 L240,180 L300,150" stroke="var(--brand)" strokeWidth={0.5} />
        {[0, 1, 2, 3].map((i) => (
          <line key={`b2f${i}`} x1={180} y1={180 + i * 24} x2={240} y2={210 + i * 24} stroke="var(--brand)" strokeWidth={0.4} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <line key={`b2r${i}`} x1={240} y1={210 + i * 24} x2={300} y2={180 + i * 24} stroke="var(--brand)" strokeWidth={0.3} />
        ))}
      </g>

      {/* Building 3 — short accent, front right */}
      <g opacity={0.9}>
        <path d="M260,200 L310,175 L360,200 L360,280 L310,305 L260,280 Z" stroke="var(--brand)" strokeWidth={1.5} />
        <path d="M310,175 L310,305" stroke="var(--brand)" strokeWidth={0.7} />
        <path d="M260,200 L310,225 L360,200" stroke="var(--brand)" strokeWidth={0.7} />
        {[0, 1, 2].map((i) => (
          <line key={`b3f${i}`} x1={260} y1={225 + i * 20} x2={310} y2={250 + i * 20} stroke="var(--brand)" strokeWidth={0.5} />
        ))}
      </g>

      {/* Small accent block — front left */}
      <g opacity={0.3}>
        <path d="M70,220 L110,200 L150,220 L150,275 L110,295 L70,275 Z" stroke="var(--brand)" strokeWidth={0.8} />
        <path d="M110,200 L110,295" stroke="var(--brand)" strokeWidth={0.4} />
      </g>
    </svg>
  )
}

export default function HomePage() {
  return (
    <div>
      {/* ─── SECTION 1: Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-28">
          <div className="md:grid md:grid-cols-[1fr_40%] md:items-center md:gap-8">
            {/* Left: text */}
            <div>
              <h1 className="font-heading text-4xl md:text-6xl leading-[1.1] tracking-tight mb-6">
                SA Property Management,
                <br />
                <span className="text-brand">Built Right.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
                Every corner of this product was designed by someone who has done the work — inspections, debt collection, HOA setup, Tribunal submissions, tenant screening. Not read about it. Done it. Then automated.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="text-base h-13 px-8" render={<Link href="/login" />}>
                  Start free — 1 unit <ArrowRight className="ml-2 size-4" />
                </Button>
                <Button size="lg" variant="outline" className="text-base h-13 px-8" render={<a href="#features" />}>
                  See how it works <ArrowDown className="ml-2 size-4" />
                </Button>
              </div>
            </div>

            {/* Right: isometric illustration */}
            <div className="hidden md:block" style={{ maskImage: "linear-gradient(to right, black 60%, transparent 100%)" }}>
              <IsometricBuildings />
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 2: Pain points ─── */}
      <section className="relative overflow-hidden max-w-6xl mx-auto px-4 py-16 md:py-24">
        {/* Decorative amber hexagon */}
        <div className="absolute -top-20 -right-20 w-[400px] h-[400px] opacity-[0.04] pointer-events-none">
          <svg viewBox="0 0 200 200" className="w-full h-full text-brand">
            <polygon
              points="100,0 200,50 200,150 100,200 0,150 0,50"
              fill="currentColor"
              transform="rotate(15, 100, 100)"
            />
          </svg>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <Card className="border-l-4 border-l-brand bg-surface hover:bg-surface-elevated transition-colors">
            <CardContent className="pt-6 space-y-3">
              <Wallet className="size-8 text-brand" />
              <h3 className="font-heading text-xl">The credit check problem</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tired of paying R310 per credit check? With Pleks, applicants pay for their own screening.
                You get the FitScore. You never pay for a check.
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-brand bg-surface hover:bg-surface-elevated transition-colors">
            <CardContent className="pt-6 space-y-3">
              <CalendarCheck className="size-8 text-brand" />
              <h3 className="font-heading text-xl">The rent collection problem</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Still chasing EFTs every month? Pleks creates a DebiCheck mandate with the lease.
                Rent collects automatically. Every month.
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-brand bg-surface hover:bg-surface-elevated transition-colors">
            <CardContent className="pt-6 space-y-3">
              <ShieldCheck className="size-8 text-brand" />
              <h3 className="font-heading text-xl">The compliance problem</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                What happens at the Rental Housing Tribunal? Every inspection, deposit, and arrears letter
                is logged and exportable as a Tribunal bundle. Automatically.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── SECTION 3: How it works ─── */}
      <section id="features" className="bg-surface/50 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">

          <div className="mb-12 md:mb-16">
            <p className="text-brand text-sm font-semibold uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="font-heading text-3xl md:text-4xl max-w-lg">
              From listing to statement in three steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="hidden md:block absolute top-10 left-[33%] right-[33%] h-px bg-gradient-to-r from-brand/40 via-brand/20 to-brand/40 pointer-events-none" />

            <div className="relative bg-surface rounded-xl p-6 border border-border/50 hover:border-brand/30 transition-colors group">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-bold text-sm">1</span>
                </div>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <h3 className="font-heading text-xl mb-3 group-hover:text-brand transition-colors">List and screen</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                Create a listing. Applicants apply free. Pleks extracts income from their bank statement automatically.
              </p>
              <div className="flex items-center gap-2 text-xs text-brand font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                Free for every applicant — no barrier to apply
              </div>
            </div>

            <div className="relative bg-surface rounded-xl p-6 border border-brand/30 ring-1 ring-brand/10 hover:border-brand/50 transition-colors group">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-bold text-sm">2</span>
                </div>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <h3 className="font-heading text-xl mb-3 group-hover:text-brand transition-colors">Shortlist and verify</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                Shortlisted applicants pay for their own credit check. You get a full FitScore — credit, income ratio, rental history, employment, judgements.
              </p>
              <div className="flex items-center gap-2 text-xs text-brand font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                Paid by the applicant — never by you
              </div>
            </div>

            <div className="relative bg-surface rounded-xl p-6 border border-border/50 hover:border-brand/30 transition-colors group">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-bold text-sm">3</span>
                </div>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <h3 className="font-heading text-xl mb-3 group-hover:text-brand transition-colors">Sign, collect, report</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                Lease signed digitally. DebiCheck mandate created. Rent collects automatically. Owner statements generate with one click.
              </p>
              <div className="flex items-center gap-2 text-xs text-brand font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                Automated from signature to statement
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-8 text-center">
            Most agents are fully set up and collecting rent within 48 hours.
          </p>

        </div>
      </section>

      {/* ─── SECTION 3.5: Product Preview ─── */}
      <ProductPreview />

      {/* ─── SECTION 4: Feature Explorer (with dot grid) ─── */}
      <div
        style={{
          backgroundImage: "radial-gradient(circle, rgba(232,168,56,0.12) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <FeatureExplorer />
      </div>

      {/* ─── SECTION 5: Cost Comparison ─── */}
      <CostComparison />

      {/* ─── SECTION 6: Founding agent CTA ─── */}
      <section className="relative bg-brand-dim py-16 md:py-20 overflow-hidden">
        {/* Amber glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-brand/10 rounded-full blur-[80px]" />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <Badge className="bg-brand/20 text-brand border-brand/30 mb-4">Limited</Badge>
          <h2 className="font-heading text-3xl md:text-4xl mb-4">10 founding agent spots</h2>
          <p className="text-lg text-muted-foreground mb-2">
            {formatZAR(FOUNDING_AGENT_PRICE_CENTS)}/month for your first 24 months.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Then standard R599/month. No contract.
          </p>
          <Button size="lg" className="text-base h-13 px-8" render={<Link href="/early-access" />}>
            Claim founding agent price <ArrowRight className="ml-2 size-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Steward tier. Up to 20 units. Price locks for 24 months then moves to standard rate.
          </p>
        </div>
      </section>
    </div>
  )
}
