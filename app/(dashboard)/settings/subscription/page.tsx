"use client"

/**
 * app/(dashboard)/settings/subscription/page.tsx — Billing and subscription management: plan, usage, founding agent pricing
 *
 * Route:  /settings/subscription
 * Auth:   gateway (dashboard layout)
 * Data:   tier/status from useTier hook; founding agent fields from Supabase organisations table; usage from billing actions
 */

import { useEffect, useState } from "react"
import { useTier } from "@/hooks/useTier"
import { useOrg } from "@/hooks/useOrg"
import { TIER_PRICING, TIER_LIMITS, formatZAR } from "@/lib/constants"
import { TIER_FEATURES } from "@/lib/tier/gates"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Check, Sparkles, Award } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { createClient } from "@/lib/supabase/client"
import { isFoundingAgentActive, getMonthlyPriceCents, foundingAgentMonthsRemaining, type PricingContext } from "@/lib/tier/pricing"
import type { MessagingUsageData } from "@/lib/actions/billing"
import { cn } from "@/lib/utils"

// ── AI usage section ──────────────────────────────────────────────────────────

function AiUsageSection() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { getAiUsageCount } = await import("@/lib/actions/billing")
      const result = await getAiUsageCount()
      if (!cancelled) {
        if ("error" in result) {
          console.error("AiUsageSection:", result.error)
        } else {
          setCount(result.count)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (count === null) return <div className="h-6 w-24 animate-pulse bg-muted rounded" />

  return (
    <div className="flex justify-between text-sm">
      <span>AI triage calls</span>
      <span className="text-muted-foreground">{count} this month (unlimited)</span>
    </div>
  )
}

// ── Messaging usage section ───────────────────────────────────────────────────

function MessagingUsageSection() {
  const [usage, setUsage] = useState<MessagingUsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { getMessagingUsage } = await import("@/lib/actions/billing")
      const result = await getMessagingUsage()
      if (!cancelled) {
        if ("error" in result) {
          console.error("MessagingUsageSection:", result.error)
        } else {
          setUsage(result)
        }
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="h-20 animate-pulse bg-muted rounded-lg" />
  }
  if (!usage) return null

  const whatsappPct = usage.quotaWhatsapp > 0
    ? Math.min(100, Math.round((usage.whatsappCount / usage.quotaWhatsapp) * 100))
    : 0
  const emailPct = usage.quotaEmail > 0
    ? Math.min(100, Math.round((usage.emailCount / usage.quotaEmail) * 100))
    : 0

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>WhatsApp</span>
          <span className="text-muted-foreground">{usage.whatsappCount} / {usage.quotaWhatsapp}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${whatsappPct}%` }}
          />
        </div>
        {usage.overageWhatsapp > 0 && (
          <p className="text-xs text-amber-600 mt-1">
            {usage.overageWhatsapp} overage &middot; R{(usage.overageCents / 100).toFixed(2)} billed
          </p>
        )}
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Email</span>
          <span className="text-muted-foreground">{usage.emailCount} / {usage.quotaEmail}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${emailPct}%` }}
          />
        </div>
      </div>
      {usage.smsCount > 0 && (
        <p className="text-sm text-muted-foreground">
          SMS fallback: {usage.smsCount} sends this month
        </p>
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
  const monthlyPrice = foundingCtx ? getMonthlyPriceCents(foundingCtx) : (TIER_PRICING[tier].monthly ?? 0)
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
                  "Bank reconciliation", "Owner statements",
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

            <ActionButton tone="primary" className="w-full">
              Upgrade to {trialTier ?? "Steward"} — {formatZAR(monthlyPrice)}/month
            </ActionButton>
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
              <p>Active leases: {limits.leases ?? "Custom"}</p>
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

            {tier !== "firm" && <ActionButton tone="primary" className="w-full">Upgrade Plan</ActionButton>}
            {tier !== "owner" && (
              <ActionButton tone="secondary" className="w-full">Cancel Subscription</ActionButton>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Messaging + AI usage ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This month&apos;s usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tier === "owner" ? (
            <p className="text-sm text-muted-foreground">
              Upgrade to Steward to see detailed usage metrics.
            </p>
          ) : (
            <>
              <MessagingUsageSection />
              <AiUsageSection />
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        To activate founding agent pricing, run the SQL in docs/founding-agent-activation.sql via Supabase.
      </p>
    </div>
  )
}
