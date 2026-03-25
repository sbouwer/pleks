import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, ArrowRight } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Pleks Pricing — From R599/month | No Setup Fees",
  description: "Simple, transparent pricing for SA property management. Free Owner plan for 1 unit. No onboarding fees. No contracts. Cancel anytime.",
}

const tiers = [
  {
    name: "Owner",
    price: "Free",
    period: "",
    units: "1 unit",
    users: "1 user",
    base: null,
    extras: ["Lease management", "Basic inspections", "Tenant portal", "Maintenance log", "Email notifications"],
    cta: "Start free",
    variant: "outline" as const,
    href: "/login",
  },
  {
    name: "Steward",
    price: "R 599",
    period: "/month",
    units: "20 units",
    users: "2 users",
    base: "Everything in Owner",
    extras: [
      "Bank reconciliation",
      "Owner statements",
      "Unlimited inspections",
      "AI maintenance triage",
      "Digital lease signing",
      "SMS notifications",
      "Basic reports",
      "FitScore screening",
    ],
    cta: "Start 14-day trial",
    variant: "outline" as const,
    href: "/login",
  },
  {
    name: "Portfolio",
    price: "R 999",
    period: "/month",
    units: "50 units",
    users: "5 users",
    popular: true,
    base: "Everything in Steward",
    extras: [
      "DebiCheck collections",
      "Arrears automation",
      "Application pipeline",
      "Municipal bills",
      "Full reporting",
      "Lease automation",
      "AI bank statement extraction",
    ],
    cta: "Get started",
    variant: "default" as const,
    href: "/login",
  },
  {
    name: "Firm",
    price: "R 2,499",
    period: "/month",
    units: "Unlimited",
    users: "Unlimited",
    base: "Everything in Portfolio",
    extras: [
      "HOA / body corporate",
      "Contractor portal",
      "AI legal documents (Opus)",
      "Custom templates",
      "Scheduled reports",
      "EAAB tools",
    ],
    cta: "Contact us",
    variant: "outline" as const,
    href: "/early-access",
  },
]

const FAQ = [
  {
    q: "What counts as a unit?",
    a: "Any active property unit — apartment, house, commercial space. Archived units don't count towards your limit.",
  },
  {
    q: "Is the credit check fee charged to me?",
    a: "No. Stage 2 screening (R399) is paid by the applicant, not the agent. You get the FitScore data as part of your subscription.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contract. Cancel from your billing settings. Your data remains accessible for 90 days after cancellation.",
  },
  {
    q: "What's the difference between Steward and Portfolio?",
    a: "Steward covers up to 20 units with bank recon, owner statements, and inspections. Portfolio adds DebiCheck collections, arrears automation, and the full application pipeline.",
  },
  {
    q: "Do you support trust accounts?",
    a: "Yes. Pleks has separate trust and business account tracking built in from day one, designed for PPRA compliance.",
  },
]

export default function PricingPage() {
  return (
    <div className="px-4 py-16 md:py-24">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-heading text-4xl md:text-5xl mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-muted-foreground text-lg">
            No onboarding fees. No hidden costs. Cancel anytime.
          </p>
        </div>

        {/* Founding agent callout */}
        <div className="max-w-xl mx-auto mb-12 rounded-lg bg-brand-dim p-4 text-center">
          <p className="text-sm">
            <span className="text-brand font-semibold">Founding agent pricing:</span>{" "}
            R299/month on Steward for your first 24 months. Limited spots.
          </p>
          <Button size="sm" variant="link" className="text-brand mt-1" render={<Link href="/early-access" />}>
            Claim your spot <ArrowRight className="ml-1 size-3" />
          </Button>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {tiers.map((tier) => (
            <div key={tier.name} className="group relative pt-4 cursor-pointer">
              {tier.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
                  <span className="inline-block bg-brand text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}
              <Card
                className={[
                  "h-full flex flex-col transition-all duration-200",
                  tier.popular
                    ? "border-brand ring-1 ring-brand/40 -translate-y-1 shadow-[0_4px_24px_rgba(var(--brand-rgb),0.12)] hover:-translate-y-2 hover:shadow-[0_8px_32px_rgba(var(--brand-rgb),0.20)]"
                    : "hover:border-brand/60 hover:-translate-y-1 hover:shadow-[0_0_0_1px_rgba(var(--brand-rgb),0.2)]",
                ].join(" ")}
              >
                <CardHeader>
                  <CardTitle className="font-heading text-xl group-hover:text-brand transition-colors duration-200">
                    {tier.name}
                  </CardTitle>
                  <div className="mt-2">
                    <span className="font-heading text-3xl">{tier.price}</span>
                    {tier.period && (
                      <span className="text-muted-foreground text-sm">{tier.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tier.units} &middot; {tier.users}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col flex-1">
                  {/* Base tier reference */}
                  <div className="mb-4 pb-4 border-b border-border/40">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mb-1">
                      Includes
                    </p>
                    <p className="text-sm font-semibold">
                      {tier.base ?? "\u00A0"}
                    </p>
                  </div>

                  {/* Extra features */}
                  <ul className="space-y-2 flex-1 mb-6">
                    {tier.extras.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full mt-auto transition-transform duration-200 group-hover:scale-[1.02]"
                    variant={tier.variant}
                    render={<Link href={tier.href} />}
                  >
                    {tier.cta}
                  </Button>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="font-heading text-2xl md:text-3xl text-center mb-10">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {FAQ.map((faq) => (
              <div key={faq.q} className="border-b border-border/50 pb-6">
                <h3 className="text-sm font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
