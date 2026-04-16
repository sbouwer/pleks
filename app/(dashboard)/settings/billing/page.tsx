"use client"

import { useEffect, useState, useTransition } from "react"
import { useTier } from "@/hooks/useTier"
import { useOrg } from "@/hooks/useOrg"
import { TIER_PRICING, TIER_LIMITS, OWNER_PRO_PRICE_CENTS, OWNER_PRO_MAX_LEASES, formatZAR } from "@/lib/constants"
import { TIER_FEATURES } from "@/lib/tier/gates"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Sparkles, Award, Zap, ArrowRight } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { createClient } from "@/lib/supabase/client"
import { isFoundingAgentActive, getMonthlyPriceCents, foundingAgentMonthsRemaining, type PricingContext } from "@/lib/tier/pricing"
import { disableLeasePremium, type OwnerProSummary } from "@/lib/actions/billing"
import { OwnerProUpgradeCard } from "@/components/billing/OwnerProUpgradeCard"
import { toast } from "sonner"
import Link from "next/link"
import { cn } from "@/lib/utils"

// ── Owner Pro section ─────────────────────────────────────────────────────────

function OwnerProSection({ orgId }: { orgId: string }) {
  const [summary, setSummary] = useState<OwnerProSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [disabling, startDisable] = useTransition()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { getOwnerProSummary } = await import("@/lib/actions/billing")
      const result = await getOwnerProSummary()
      if (!cancelled) {
        if ("error" in result) {
          console.error("OwnerProSection:", result.error)
        } else {
          setSummary(result)
        }
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [orgId])

  function handleDisable(leaseId: string) {
    startDisable(async () => {
      const result = await disableLeasePremium(leaseId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Owner Pro disabled")
        setSummary((prev) =>
          prev
            ? {
                ...prev,
                premiumLeaseCount: prev.premiumLeaseCount - 1,
                monthlyCents:      prev.monthlyCents - OWNER_PRO_PRICE_CENTS,
                leases:            prev.leases.filter((l) => l.id !== leaseId),
              }
            : prev,
        )
      }
    })
  }

  if (loading) {
    return <div className="h-24 rounded-xl border bg-card animate-pulse" />
  }

  const usedSlots = summary?.premiumLeaseCount ?? 0
  const slotsLeft = OWNER_PRO_MAX_LEASES - usedSlots

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold">Owner Pro premium leases</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {usedSlots} of {OWNER_PRO_MAX_LEASES} slots used
        </span>
      </div>

      {/* Active premium leases */}
      <div className="divide-y">
        {(summary?.leases ?? []).map((lease) => (
          <div key={lease.id} className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-2 w-2 rounded-full bg-brand shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {lease.tenantName ?? "Tenant"}{lease.property ? ` — ${lease.property}` : ""}
                  {lease.unit ? ` · ${lease.unit}` : ""}
                </p>
                {lease.enabledAt && (
                  <p className="text-xs text-muted-foreground">
                    Enabled {new Date(lease.enabledAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}{formatZAR(OWNER_PRO_PRICE_CENTS)}/month
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDisable(lease.id)}
              disabled={disabling}
              className="text-xs text-muted-foreground hover:text-danger transition-colors shrink-0"
            >
              Disable
            </button>
          </div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: slotsLeft }).map((_, i) => (
          <div key={`slot-${i}`} className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
            <div className="h-2 w-2 rounded-full border border-muted-foreground/40 shrink-0" />
            <p className="text-xs">1 slot available</p>
            <Link href="/leases" className="text-xs text-brand hover:underline ml-auto">
              Enable on a lease →
            </Link>
          </div>
        ))}
      </div>

      {/* Footer */}
      {usedSlots > 0 && (
        <div className="px-4 py-3 border-t bg-muted/20 text-sm space-y-0.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly bill</span>
            <span className="font-medium">{formatZAR(summary?.monthlyCents ?? 0)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Billing via monthly debit order — payment setup coming soon
          </p>
        </div>
      )}

      {/* Upsell to Steward when near cap */}
      {usedSlots >= 2 && (
        <div className="px-4 py-3 border-t bg-muted/10">
          <p className="text-xs text-muted-foreground">
            Need premium on more than 3 leases? Steward ({formatZAR(TIER_PRICING.steward.monthly)}/mo) covers
            up to 20 leases with all features included.
          </p>
          <button
            type="button"
            className="mt-1.5 text-xs text-brand hover:underline flex items-center gap-1"
          >
            Upgrade to Steward
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* First lease CTA */}
      {usedSlots === 0 && (
        <div className="px-4 py-4 border-t">
          <OwnerProUpgradeCard
            usedSlots={0}
            onEnable={() => {
              setSummary((prev) => prev ? { ...prev, premiumLeaseCount: 0 } : prev)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Main billing page ─────────────────────────────────────────────────────────

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

  const limits       = TIER_LIMITS[tier]
  const features     = TIER_FEATURES[tier]
  const isFounding   = foundingCtx ? isFoundingAgentActive(foundingCtx) : false
  const monthlyPrice = foundingCtx ? getMonthlyPriceCents(foundingCtx) : TIER_PRICING[tier].monthly
  const foundingMonthsLeft = foundingCtx?.founding_agent_expires_at
    ? foundingAgentMonthsRemaining(foundingCtx.founding_agent_expires_at)
    : null
  const foundingExpired = foundingCtx?.founding_agent && !isFounding

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl">Billing</h1>

      {/* ── Trial state ── */}
      {isTrialing && (
        <Card className="border-brand/30 bg-brand-dim/30">
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
                  As a founding agent, your price is{" "}
                  <strong>{formatZAR(monthlyPrice)}/month</strong> for 24 months, then{" "}
                  {formatZAR(TIER_PRICING.steward.monthly)}/month.
                </p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-2">Included in your trial:</p>
              <ul className="space-y-1">
                {[
                  "Bank reconciliation", "Owner statements", "DebiCheck collections",
                  "Arrears automation", "Reporting suite", "Municipal bill extraction",
                  "AI maintenance triage", "Digital lease signing",
                ].map((f) => (
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

      {/* ── Standard plan card ── */}
      {!isTrialing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg capitalize">{tier} Plan</CardTitle>
                {isFounding && (
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                    "text-xs font-medium bg-amber-100 text-amber-700",
                  )}>
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
                Your founding agent pricing ended. You are now on standard Steward pricing at{" "}
                {formatZAR(TIER_PRICING.steward.monthly)}/month.
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
                  <li className="text-sm text-muted-foreground">+{features.length - 8} more</li>
                )}
              </ul>
            </div>

            {tier !== "firm" && <Button className="w-full">Upgrade Plan</Button>}
            {tier !== "owner" && (
              <Button variant="outline" className="w-full">Cancel Subscription</Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Owner Pro section (only for Owner tier) ── */}
      {tier === "owner" && !isTrialing && orgId && (
        <OwnerProSection orgId={orgId} />
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        To activate founding agent pricing, run the SQL in docs/founding-agent-activation.sql via Supabase.
      </p>
    </div>
  )
}
