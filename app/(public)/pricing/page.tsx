/**
 * app/(public)/pricing/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Pleks Pricing — From R699/month | No Setup Fees",
  description: "Property management software built by someone who knows what property management actually involves. From R699/month. No setup fees.",
}

const tiers = [
  {
    name: "Steward",
    tagline: "Solo practitioners just holding their own book.",
    leases: 15,
    price: 699,
    href: "/register?tier=steward",
    cta: "Start as Steward",
  },
  {
    name: "Growth",
    tagline: "Building a book, two pairs of hands, one landlord at a time.",
    leases: 30,
    price: 1199,
    href: "/register?tier=growth",
    cta: "Start as Growth",
  },
  {
    name: "Portfolio",
    tagline: "A small agency running a real portfolio, with a trust account that reconciles nightly.",
    leases: 75,
    price: 2599,
    href: "/register?tier=portfolio",
    cta: "Start as Portfolio",
    popular: true,
  },
  {
    name: "Firm",
    tagline: "Established firms with a principal, multiple agents, and HOAs on the side.",
    leases: 150,
    price: 4499,
    href: "/register?tier=firm",
    cta: "Start as Firm",
  },
]

const FAQ = [
  {
    q: "What counts as an active lease?",
    a: "Any lease with status 'active' — signed and running. Draft leases, expired leases, and archived units don't count. Vacancies cost you nothing.",
  },
  {
    q: "Is the credit check fee charged to me?",
    a: "No. Stage 2 screening is paid by the applicant (R399). You get the FitScore data as part of your subscription.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contract. Cancel from billing settings. Your data stays accessible for 90 days after cancellation.",
  },
  {
    q: "What happens if I go over my lease cap?",
    a: "You'll be prompted to upgrade before activating the next lease. No overages, no surprises — the system gates activation until you move up.",
  },
  {
    q: "Do you support trust accounts?",
    a: "Yes. Pleks has separate trust and business account tracking built in from day one, designed for PPRA compliance.",
  },
]

export default function PricingPage() {
  return (
    <div className="px-4 py-16 md:py-24">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="font-heading text-4xl md:text-5xl mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-2">
            Priced per active lease. Vacancies cost you nothing.
          </p>
          <p className="text-sm text-muted-foreground">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {tiers.map((tier) => {
            const perLease = Math.round(tier.price / tier.leases)
            return (
              <div
                key={tier.name}
                className={[
                  "relative flex flex-col rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5",
                  tier.popular
                    ? "border-brand border-2 ring-2 ring-brand/20 shadow-[0_0_0_1px_rgba(var(--brand-rgb),0.1),0_8px_32px_rgba(var(--brand-rgb),0.15)]"
                    : "hover:border-brand/40",
                ].join(" ")}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-block bg-brand text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                      Most popular
                    </span>
                  </div>
                )}

                <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground mb-2">
                  {tier.name}
                </p>

                <p className="text-xs text-muted-foreground leading-relaxed mb-4 min-h-[3rem]">
                  {tier.tagline}
                </p>

                <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-1">
                  Up to {tier.leases} active leases
                </p>

                <div className="mb-1">
                  <span className="font-heading text-3xl">
                    <sup className="text-base font-normal">R</sup>{tier.price.toLocaleString("en-ZA")}
                  </span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>

                <p className="text-xs text-muted-foreground mb-6">
                  That&apos;s roughly R{perLease} per lease at cap
                </p>

                <Link
                  href={tier.href}
                  className="mt-auto text-sm font-medium text-brand hover:underline underline-offset-4"
                >
                  {tier.cta} →
                </Link>
              </div>
            )
          })}

          {/* Bespoke / Beyond 150 */}
          <div className="flex flex-col rounded-xl border border-dashed border-border/60 bg-card/50 p-5">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground mb-2">
              Beyond 150
            </p>

            <p className="text-xs text-muted-foreground leading-relaxed mb-4 min-h-[3rem]">
              More than 150 active leases? The pricing bends for you too — that&apos;s a conversation, not a form.
            </p>

            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-1">
              Custom · Bespoke
            </p>

            <div className="mb-1">
              <span className="font-heading text-3xl font-mono tracking-tight">Let&apos;s talk</span>
            </div>

            <p className="text-xs text-muted-foreground mb-6">
              One call · ZA hours
            </p>

            <a
              href="mailto:stean@pleks.co.za"
              className="mt-auto text-sm font-medium text-brand hover:underline underline-offset-4"
            >
              Email the founder →
            </a>
          </div>
        </div>

        {/* Owner free footnote */}
        <p className="text-center text-sm text-muted-foreground mb-20">
          Just getting started?{" "}
          <Link href="/register" className="text-brand hover:underline underline-offset-4">
            The Owner tier is free — 1 active lease, forever.
          </Link>
        </p>

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
