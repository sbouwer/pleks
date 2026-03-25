"use client"

import { useTier } from "@/hooks/useTier"
import { TIER_PRICING, TIER_LIMITS, formatZAR } from "@/lib/constants"
import { TIER_FEATURES } from "@/lib/tier/gates"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Sparkles } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"

export default function BillingPage() {
  const { tier, status, periodEnd, isTrialing, trialDaysLeft, trialTier } = useTier()

  const pricing = TIER_PRICING[tier]
  const limits = TIER_LIMITS[tier]
  const features = TIER_FEATURES[tier]

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

            <Button className="w-full">Upgrade to {trialTier ?? "Steward"} — {formatZAR(TIER_PRICING.steward.monthly)}/month</Button>

            <p className="text-xs text-muted-foreground text-center">
              No credit card required until you upgrade.
              If you don&apos;t upgrade, you&apos;ll move to the free Owner plan.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Standard billing card */}
      {!isTrialing && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg capitalize">{tier} Plan</CardTitle>
              <StatusBadge status={status === "active" ? "active" : "arrears"} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl">
                {pricing.monthly === 0 ? "Free" : formatZAR(pricing.monthly)}
              </span>
              {pricing.monthly > 0 && (
                <span className="text-muted-foreground text-sm">/month</span>
              )}
            </div>

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
    </div>
  )
}
