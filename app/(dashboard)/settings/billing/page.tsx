"use client"

import { useEffect, useState } from "react"
import { useTier } from "@/hooks/useTier"
import { TIER_PRICING, TIER_LIMITS, formatZAR } from "@/lib/constants"
import { TIER_FEATURES } from "@/lib/tier/gates"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Sparkles, Award } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { isFoundingAgentActive, getMonthlyPriceCents, foundingAgentMonthsRemaining, type PricingContext } from "@/lib/tier/pricing"

export default function BillingPage() {
  const { tier, status, periodEnd, isTrialing, trialDaysLeft, trialTier } = useTier()
  const { orgId } = useOrg()

  const [foundingCtx, setFoundingCtx] = useState<PricingContext | null>(null)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    const supabase = createClient()
    async function load() {
      const { data } = await supabase
        .from("organisations")
        .select("founding_agent, founding_agent_price_cents, founding_agent_expires_at")
        .eq("id", orgId)
        .single()
      if (!cancelled && data) {
        setFoundingCtx({
          tier,
          founding_agent: data.founding_agent,
          founding_agent_price_cents: data.founding_agent_price_cents,
          founding_agent_expires_at: data.founding_agent_expires_at,
        })
      }
    }
    load()
    return () => { cancelled = true }
  }, [orgId, tier])

  const limits = TIER_LIMITS[tier]
  const features = TIER_FEATURES[tier]
  const isFounding = foundingCtx ? isFoundingAgentActive(foundingCtx) : false
  const monthlyPrice = foundingCtx ? getMonthlyPriceCents(foundingCtx) : TIER_PRICING[tier].monthly
  const foundingMonthsLeft = foundingCtx?.founding_agent_expires_at
    ? foundingAgentMonthsRemaining(foundingCtx.founding_agent_expires_at)
    : null

  // Did the founding deal expire?
  const foundingExpired = foundingCtx?.founding_agent && !isFounding

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Billing</h1>

      {/* Trial state */}
      {isTrialing && (
        <Card className="mb-6 border-brand/30 bg-brand-dim/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" />
              <CardTitle className="text-lg capitalize">{trialTier ?? "Steward"} Trial</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              14-day free trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
            </p>

            {isFounding && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
                <Award className="size-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-400">
                  As a founding agent, your price is <strong>{formatZAR(monthlyPrice)}/month</strong> for 24 months, then {formatZAR(TIER_PRICING.steward.monthly)}/month.
                </p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-2">Included in your trial:</p>
              <ul className="space-y-1">
                {["Bank reconciliation", "Owner statements", "DebiCheck collections", "Arrears automation", "Reporting suite", "Municipal bill extraction", "AI maintenance triage", "Digital lease signing"].map((f) => (
                  <li key={f} className="text-sm text-muted-foreground flex items-center gap-2">
                    <Check className="h-3 w-3 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <Button className="w-full">
              Upgrade to {trialTier ?? "Steward"} — {formatZAR(monthlyPrice)}/month
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              No credit card required until you upgrade.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Standard billing card */}
      {!isTrialing && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg capitalize">{tier} Plan</CardTitle>
                {isFounding && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <Award className="size-3" />
                    Founding
                  </span>
                )}
              </div>
              <StatusBadge status={status === "active" ? "active" : "arrears"} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl">
                {monthlyPrice === 0 ? "Free" : formatZAR(monthlyPrice)}
              </span>
              {monthlyPrice > 0 && (
                <span className="text-muted-foreground text-sm">/month</span>
              )}
            </div>

            {/* Founding agent pricing details */}
            {isFounding && foundingMonthsLeft && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-400">Founding Agent Price</p>
                <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-1">
                  {formatZAR(monthlyPrice)}/month for {foundingMonthsLeft} more month{foundingMonthsLeft !== 1 ? "s" : ""}.
                  Standard price after: {formatZAR(TIER_PRICING.steward.monthly)}/month.
                </p>
              </div>
            )}

            {foundingExpired && (
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                Your founding agent pricing ended. You are now on standard Steward pricing at {formatZAR(TIER_PRICING.steward.monthly)}/month.
              </div>
            )}

            <div className="text-sm text-muted-foreground space-y-1">
              <p>Units: {limits.units ?? "Unlimited"}</p>
              <p>Users: {limits.users ?? "Unlimited"}</p>
              {periodEnd && (
                <p>Next billing: {new Date(periodEnd).toLocaleDateString("en-ZA")}</p>
              )}
            </div>

            <div className="pt-2">
              <p className="text-sm font-medium mb-2">Included features:</p>
              <ul className="space-y-1">
                {features.slice(0, 8).map((f) => (
                  <li key={f} className="text-sm text-muted-foreground flex items-center gap-2">
                    <Check className="h-3 w-3 text-success" />
                    {f.replaceAll("_", " ")}
                  </li>
                ))}
                {features.length > 8 && (
                  <li className="text-sm text-muted-foreground">
                    +{features.length - 8} more
                  </li>
                )}
              </ul>
            </div>

            {tier !== "firm" && (
              <Button className="w-full">Upgrade Plan</Button>
            )}
            {tier !== "owner" && (
              <Button variant="outline" className="w-full">Cancel Subscription</Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activation reference */}
      <p className="text-[10px] text-muted-foreground text-center">
        To activate founding agent pricing, run the SQL in docs/founding-agent-activation.sql via Supabase.
      </p>
    </div>
  )
}
