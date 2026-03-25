import { TIER_PRICING, type Tier } from "@/lib/constants"

export interface PricingContext {
  tier: Tier
  founding_agent: boolean | null
  founding_agent_price_cents: number | null
  founding_agent_expires_at: string | null
}

/**
 * Returns the monthly price in cents for this subscription.
 * Founding agent discount applies only when:
 *   - founding_agent is true
 *   - tier is 'steward' (founding deal is Steward-tier only)
 *   - founding_agent_expires_at is in the future
 * After 24 months: standard pricing kicks in automatically.
 */
export function getMonthlyPriceCents(ctx: PricingContext): number {
  if (isFoundingAgentActive(ctx)) {
    return ctx.founding_agent_price_cents ?? TIER_PRICING.steward.monthly
  }
  return TIER_PRICING[ctx.tier].monthly
}

/**
 * Returns true if the founding agent deal is currently active.
 */
export function isFoundingAgentActive(ctx: PricingContext): boolean {
  return (
    !!ctx.founding_agent &&
    ctx.tier === "steward" &&
    !!ctx.founding_agent_expires_at &&
    new Date(ctx.founding_agent_expires_at) > new Date()
  )
}

/**
 * Returns months remaining on founding agent deal.
 * Returns null if deal is not active.
 */
export function foundingAgentMonthsRemaining(
  expiresAt: string | null | undefined
): number | null {
  if (!expiresAt) return null
  const exp = new Date(expiresAt)
  if (exp <= new Date()) return null
  return Math.ceil(
    (exp.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30)
  )
}
