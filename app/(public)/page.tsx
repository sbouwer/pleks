import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Wallet, CalendarCheck, ShieldCheck, ArrowRight, ArrowDown } from "lucide-react"
import { formatZAR, FOUNDING_AGENT_PRICE_CENTS } from "@/lib/constants"

export const metadata = {
  title: "Pleks — SA Property Management | Replace TPN RentBook",
  description: "South African property management built right. Free applicant screening, automated DebiCheck, Tribunal-ready documentation. Replace TPN RentBook today.",
}

const FEATURES = [
  "FitScore screening", "DebiCheck collections", "Digital lease signing",
  "Inspection PWA", "Bank reconciliation", "Arrears automation",
  "Owner statements", "Municipal bills", "Deposit reconciliation",
  "HOA / body corporate", "Contractor portal", "AI legal documents",
  "Heritage building support", "SARS-ready reports", "POPIA compliant",
]

const PREMIUM_FEATURES = new Set([
  "HOA / body corporate", "Contractor portal", "AI legal documents",
])

export default function HomePage() {
  return (
    <div>
      {/* ─── SECTION 1: Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-28">
          <h1 className="font-heading text-5xl md:text-7xl leading-[1.05] tracking-tight mb-6">
            SA Property Management,
            <br />
            <span className="text-brand">Built Right.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            Built by someone who has done it for 11 years.
            Free applicant screening. Automated DebiCheck.
            Tribunal-ready documentation. Always.
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
      </section>

      {/* ─── SECTION 2: Pain points ─── */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-l-4 border-l-brand bg-surface hover:bg-surface-elevated transition-colors">
            <CardContent className="pt-6 space-y-3">
              <Wallet className="size-8 text-brand" />
              <h3 className="font-heading text-xl">The credit check problem</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tired of paying R310 per credit check? With Pleks, applicants pay R399 for their own screening.
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
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="font-heading text-3xl md:text-4xl mb-16 text-center">How it works</h2>

          <div className="space-y-16">
            {[
              {
                num: "1",
                title: "List and screen",
                desc: "Create a listing. Applicants apply free. Pleks extracts income from their bank statement. You see a pre-screen score instantly.",
              },
              {
                num: "2",
                title: "Shortlist and verify",
                desc: "Shortlisted applicants pay R399 for their credit check. You get a full FitScore — credit, income ratio, rental history, employment, judgements.",
              },
              {
                num: "3",
                title: "Sign, collect, report",
                desc: "Lease signed digitally. DebiCheck mandate created. Rent collects. Owner statements generate automatically.",
              },
            ].map((step) => (
              <div key={step.num} className="relative pl-20 md:pl-28">
                <span className="absolute left-0 top-0 font-heading text-7xl md:text-8xl text-brand/15 leading-none select-none">
                  {step.num}
                </span>
                <h3 className="font-heading text-2xl mb-2">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed max-w-xl">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SECTION 4: Feature grid ─── */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <h2 className="font-heading text-3xl md:text-4xl mb-3 text-center">Everything in one place</h2>
        <p className="text-muted-foreground text-center mb-12">
          No more TPN + RedRabbit + spreadsheets + WhatsApp.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FEATURES.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2.5 rounded-lg bg-surface p-3 text-sm"
            >
              <Check className="size-4 text-brand shrink-0" />
              <span>{feature}</span>
              {PREMIUM_FEATURES.has(feature) && (
                <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">Firm</Badge>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── SECTION 5: Comparison ─── */}
      <section className="bg-surface/50 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-heading text-3xl md:text-4xl mb-12 text-center">
            What agents actually pay right now
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-surface">
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-heading text-lg text-muted-foreground">Current stack</h3>
                <p className="text-2xl font-heading">R 2,150–2,850<span className="text-sm text-muted-foreground font-sans"> /month</span></p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>TPN RentBook + RedRabbit + credit checks</li>
                  <li>R 310 per credit check (you pay)</li>
                  <li>R 5,000 onboarding fee (WeConnectU)</li>
                  <li>15% of every arrears notice</li>
                  <li>ABSA lock-in contract</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-brand/50 bg-brand-dim/30">
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-heading text-lg text-brand">Pleks</h3>
                <p className="text-2xl font-heading">From R 599<span className="text-sm text-muted-foreground font-sans"> /month</span></p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-brand shrink-0" /> Everything in one platform</li>
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-brand shrink-0" /> R 399 per screening (applicant pays)</li>
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-brand shrink-0" /> No onboarding fee</li>
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-brand shrink-0" /> Arrears automation included</li>
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-brand shrink-0" /> No bank lock-in</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── SECTION 6: Founding agent CTA ─── */}
      <section className="bg-brand-dim py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
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
