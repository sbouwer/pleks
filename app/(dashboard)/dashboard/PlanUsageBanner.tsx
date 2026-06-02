/**
 * app/(dashboard)/dashboard/PlanUsageBanner.tsx — tier-aware plan/usage banner (populated dashboard)
 *
 * Route:  /dashboard (populated state)
 * Data:   tier from the subscription; active-lease count from the page; limits/pricing from constants
 * Notes:  Door-grammar banner from the mockup — a tier pill, "X of Y leases" with a usage bar that
 *         turns red near the cap, the next-tier value line, and an upgrade CTA to the subscription
 *         page. Growth shows the Portfolio upgrade; Firm shows the founder conversation.
 */
import Link from "next/link"
import { cn } from "@/lib/utils"
import { TIER_LIMITS, TIER_PRICING, type Tier } from "@/lib/constants"

const TIER_NAMES: Record<Tier, string> = {
  owner: "Owner", steward: "Steward", growth: "Growth", portfolio: "Portfolio", firm: "Firm", bespoke: "Bespoke",
}

const UPGRADE: Partial<Record<Tier, { line: string; cta: string }>> = {
  owner:     { line: "Managing more than your own rental? Steward adds owner statements, bank reconciliation, unlimited inspections and up to 15 leases.", cta: "See Steward" },
  steward:   { line: "Growth lifts your cap to 30 — same features, more room — at R1,199/mo.", cta: "See Growth" },
  growth:    { line: "Running a real portfolio? Portfolio adds a nightly-reconciling trust account, arrears automation and an application pipeline — up to 75 leases.", cta: "See Portfolio" },
  portfolio: { line: "Firm adds HOA & sectional-title management, EAAB tools and auditing — up to 150 leases.", cta: "See Firm" },
  firm:      { line: "Past 150 active leases? The pricing bends for you too — that's a conversation, not a form.", cta: "Talk to the founder" },
}

function priceLabel(tier: Tier): string {
  const cents = TIER_PRICING[tier]?.monthly ?? 0
  return cents === 0 ? "Free" : `R${(cents / 100).toLocaleString("en-ZA")}/mo`
}

export function PlanUsageBanner({ tier, leaseCount }: Readonly<{ tier: Tier; leaseCount: number }>) {
  const cap = TIER_LIMITS[tier]?.leases ?? null
  const up = UPGRADE[tier]
  const price = priceLabel(tier)
  const pct = cap && cap > 0 ? Math.min(100, Math.round((leaseCount / cap) * 100)) : 0
  const high = pct >= 80
  const usage = cap === 1 ? `${leaseCount} of 1 lease` : `${leaseCount} of ${cap ?? "∞"} leases`

  return (
    <div className="mb-4 flex items-center gap-5 rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-4">
      <span className="shrink-0 rounded-[var(--r-button)] border border-primary/35 bg-primary/10 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
        {TIER_NAMES[tier]}{price === "Free" ? " · Free" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-heading text-sm font-semibold text-foreground">{usage}</span>
          {price !== "Free" && <span className="font-mono text-[11px] text-muted-foreground">{price}</span>}
        </div>
        {cap != null && cap > 1 && (
          <div className="my-2 h-1.5 max-w-[360px] overflow-hidden rounded-full border border-border bg-muted">
            <div className={cn("h-full rounded-full", high ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
        )}
        {up && <p className="text-xs leading-snug text-muted-foreground">{up.line}</p>}
      </div>
      {up && (
        <Link
          href="/settings/subscription"
          className="shrink-0 rounded-[var(--r-button)] border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {up.cta}
        </Link>
      )}
    </div>
  )
}
