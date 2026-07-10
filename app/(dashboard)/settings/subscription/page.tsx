"use client"

/**
 * app/(dashboard)/settings/subscription/page.tsx — Billing and subscription management
 *
 * Route:  /settings/subscription
 * Auth:   gateway (dashboard layout)
 * Data:   useTier, useOrg hooks; subscription state direct from Supabase client;
 *         pause/resume/cancel via server actions (actions.ts)
 * Notes:  This page must remain reachable regardless of subscription lockdown state (§10.3).
 *         Cancel is two-step: initiateCancellation → AAL2 TOTP or email magic link.
 *         BillingPageInner is wrapped in Suspense so useSearchParams() doesn't block prerender.
 */

import { useEffect, useState, useTransition, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTier } from "@/hooks/useTier"
import { useOrg } from "@/hooks/useOrg"
import { TIER_PRICING, TIER_LIMITS, formatZAR } from "@/lib/constants"
import { TIER_FEATURES } from "@/lib/tier/gates"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Check, Sparkles, Award } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { createClient } from "@/lib/supabase/client"
import {
  isFoundingAgentActive,
  getMonthlyPriceCents,
  foundingAgentMonthsRemaining,
  type PricingContext,
} from "@/lib/tier/pricing"
import type { MessagingUsageData } from "@/lib/actions/billing"
import { cn } from "@/lib/utils"
import {
  pauseSubscription,
  resumeSubscription,
  initiateCancellation,
  confirmCancellation,
  type InitiateCancellationResult,
} from "./actions"
import type { SubscriptionStatus } from "@/lib/subscriptions/state"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { addCalendarMonths, fmtDateLongZA, saDateISO } from "@/lib/dates"

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

  if (loading) return <div className="h-20 animate-pulse bg-muted rounded-lg" />
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
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${whatsappPct}%` }} />
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
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${emailPct}%` }} />
        </div>
      </div>
      {usage.smsCount > 0 && (
        <p className="text-sm text-muted-foreground">SMS fallback: {usage.smsCount} sends this month</p>
      )}
    </div>
  )
}

// ── Pause dialog ──────────────────────────────────────────────────────────────

function PauseDialog({
  open, onOpenChange, onSuccess,
}: Readonly<{ open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }>) {
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await pauseSubscription(reason)
      if ("error" in result) {
        setError(result.error)
      } else {
        onOpenChange(false)
        onSuccess()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pause subscription</DialogTitle>
          <DialogDescription>
            Pausing stops new lease creation and onboarding. All existing data, scheduled
            notifications, and tenant access remain fully active. You can resume at any time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block text-sm font-medium">Reason (optional)</label>
          <textarea
            className="w-full rounded-md border border-rule bg-surface text-sm p-2 resize-none focus:outline-none focus:ring-1 focus:ring-brand"
            rows={3}
            placeholder="e.g. seasonal break, portfolio restructuring…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <ActionButton tone="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton tone="primary" onClick={handleSubmit} disabled={pending}>
            {pending ? "Pausing…" : "Pause subscription"}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Cancel dialog ─────────────────────────────────────────────────────────────

type CancelStep = "confirm" | "totp" | "email_sent"

function CancelDialog({
  open, onOpenChange, onSuccess,
}: Readonly<{ open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }>) {
  const [step, setStep] = useState<CancelStep>("confirm")
  const [totpCode, setTotpCode] = useState("")
  const [factorId, setFactorId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleInitiate() {
    setError(null)
    startTransition(async () => {
      const result: InitiateCancellationResult = await initiateCancellation()
      if ("error" in result) {
        setError(result.error)
      } else if ("success" in result) {
        onOpenChange(false)
        onSuccess()
      } else if ("requiresAAL2" in result) {
        setFactorId(result.factorId)
        setStep("totp")
      } else if ("requiresEmailLink" in result) {
        setStep("email_sent")
      }
    })
  }

  function handleTotpVerify() {
    if (!factorId || totpCode.length < 6) return
    setError(null)
    const supabase = createClient()
    startTransition(async () => {
      // Challenge then verify to step up to AAL2
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeErr || !challenge) {
        setError(challengeErr?.message ?? "Challenge failed")
        return
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: totpCode,
      })
      if (verifyErr) {
        setError("Invalid code — please try again")
        return
      }
      // Session is now AAL2 — call confirmCancellation
      const result = await confirmCancellation()
      if ("error" in result) {
        setError(result.error)
      } else {
        onOpenChange(false)
        onSuccess()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!pending) onOpenChange(v) }}>
      <DialogContent>
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Cancel subscription</DialogTitle>
              <DialogDescription>
                Your data stays fully accessible and exportable for 12 months after cancellation.
                You can reactivate any time before then and everything will be exactly where you
                left it. After 12 months, operational data is deleted per our retention policy.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 text-sm text-muted-foreground space-y-1">
              <p>• Tenant, landlord, and supplier portals remain live.</p>
              <p>• Scheduled notifications continue to fire.</p>
              <p>• All reads and exports remain available.</p>
              <p>• New leases and onboarding stop immediately.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <ActionButton tone="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
                Keep subscription
              </ActionButton>
              <ActionButton tone="destructive" onClick={handleInitiate} disabled={pending}>
                {pending ? "Confirming…" : "Cancel subscription"}
              </ActionButton>
            </DialogFooter>
          </>
        )}

        {step === "totp" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm with authenticator</DialogTitle>
              <DialogDescription>
                Enter the 6-digit code from your authenticator app to confirm cancellation.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full rounded-md border border-rule bg-surface text-sm p-2 tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="000000"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <ActionButton tone="secondary" onClick={() => { setStep("confirm"); setTotpCode("") }} disabled={pending}>
                Back
              </ActionButton>
              <ActionButton
                tone="destructive"
                onClick={handleTotpVerify}
                disabled={pending || totpCode.length < 6}
              >
                {pending ? "Verifying…" : "Confirm cancellation"}
              </ActionButton>
            </DialogFooter>
          </>
        )}

        {step === "email_sent" && (
          <>
            <DialogHeader>
              <DialogTitle>Check your email</DialogTitle>
              <DialogDescription>
                A confirmation link has been sent to your email address. Click the link in the
                email to confirm your cancellation. The link expires in 24 hours.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <ActionButton tone="secondary" onClick={() => onOpenChange(false)}>Close</ActionButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Full subscription state fetch ─────────────────────────────────────────────

interface FullSubState {
  status: SubscriptionStatus
  paused_at: string | null
  pause_reason: string | null
  pending_cancellation_since: string | null
  cancelled_at: string | null
  purge_eligible_at: string | null
}

function useFullSubState(orgId: string | null) {
  const [state, setState] = useState<FullSubState | null>(null)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    const supabase = createClient()
    async function load() {
      const { data, error: queryError } = await supabase
        .from("subscriptions")
        .select("status, paused_at, pause_reason, pending_cancellation_since, cancelled_at, purge_eligible_at")
        .eq("org_id", orgId)
        .not("status", "eq", "purged")
        .maybeSingle()
        logQueryError("load subscriptions", queryError)
      if (!cancelled) setState(data as FullSubState | null)
    }
    load()
    return () => { cancelled = true }
  }, [orgId])

  return state
}

// ── Main billing page ─────────────────────────────────────────────────────────

function BillingPageInner() {
  const { tier, status, periodEnd, isTrialing, trialDaysLeft, trialTier } = useTier()
  const { orgId } = useOrg()
  const router = useRouter()
  const searchParams = useSearchParams()

  const fullSub = useFullSubState(orgId)
  const liveStatus: SubscriptionStatus = (fullSub?.status ?? status ?? "active") as SubscriptionStatus

  const [foundingCtx, setFoundingCtx] = useState<PricingContext | null>(null)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [resumePending, startResumeTransition] = useTransition()
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  // Show feedback from magic-link cancel confirmation redirect
  useEffect(() => {
    if (searchParams?.get("cancelled") === "1") {
      setActionFeedback({ type: "success", msg: "Your subscription has been cancelled." })
      router.replace("/settings/subscription")
    } else if (searchParams?.get("cancel_error")) {
      const code = searchParams.get("cancel_error")
      setActionFeedback({
        type: "error",
        msg: code === "not_pending"
          ? "No pending cancellation found — it may have expired."
          : "Cancellation could not be confirmed. Please try again.",
      })
      router.replace("/settings/subscription")
    }
  }, [searchParams, router])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    const supabase = createClient()
    async function load() {
      const { data, error: queryError } = await supabase
        .from("organisations")
        .select("founding_agent, founding_agent_price_cents, founding_agent_expires_at")
        .eq("id", orgId)
        .single()
        logQueryError("load organisations", queryError)
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

  function handleResume() {
    setActionFeedback(null)
    startResumeTransition(async () => {
      const result = await resumeSubscription()
      if ("error" in result) {
        setActionFeedback({ type: "error", msg: result.error })
      } else {
        setActionFeedback({ type: "success", msg: "Subscription resumed. Full access restored." })
        globalThis.location.reload()  // full reload so the header bell + org capabilities re-read the new state
      }
    })
  }

  const limits       = TIER_LIMITS[tier]
  const features     = TIER_FEATURES[tier]
  const isFounding   = foundingCtx ? isFoundingAgentActive(foundingCtx) : false
  const monthlyPrice = foundingCtx ? getMonthlyPriceCents(foundingCtx) : (TIER_PRICING[tier].monthly ?? 0)
  const foundingMonthsLeft = foundingCtx?.founding_agent_expires_at
    ? foundingAgentMonthsRemaining(foundingCtx.founding_agent_expires_at)
    : null
  const foundingExpired = foundingCtx?.founding_agent && !isFounding

  const isPaused    = liveStatus === "paused"
  const isCancelled = liveStatus === "cancelled"
  const isPending   = liveStatus === "pending_cancellation"
  // Free Owner plan has no paid subscription to pause (the server rejects it too).
  const canPause    = (liveStatus === "active" || liveStatus === "past_due") && tier !== "owner"
  const canResume   = isPaused
  const canCancel   = liveStatus === "active" || liveStatus === "past_due" || isPaused

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl">Billing</h1>

      {/* ── Action feedback banner ── */}
      {actionFeedback && (
        <div className={cn(
          "rounded-md p-3 text-sm",
          actionFeedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800",
        )}>
          {actionFeedback.msg}
        </div>
      )}

      {/* ── Paused state banner ── */}
      {isPaused && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-800">
            Your subscription is paused.
          </p>
          <p className="text-xs text-amber-700">
            All data, exports, and scheduled notifications remain active. New onboarding is paused
            until you resume.
            {fullSub?.pause_reason && ` Reason: ${fullSub.pause_reason}`}
          </p>
          <ActionButton tone="primary" size="sm" onClick={handleResume} disabled={resumePending}>
            {resumePending ? "Resuming…" : "Resume subscription"}
          </ActionButton>
        </div>
      )}

      {/* ── Pending cancellation banner ── */}
      {isPending && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-medium text-orange-800">Cancellation in progress</p>
          <p className="text-xs text-orange-700 mt-1">
            A cancellation request has been initiated. Check your email for a confirmation link,
            or complete the step-up authentication in your browser. Unconfirmed requests expire
            in 24 hours.
          </p>
        </div>
      )}

      {/* ── Cancelled state banner ── */}
      {isCancelled && fullSub?.cancelled_at && (
        <div className="rounded-md border border-rule bg-muted/40 p-4 space-y-2">
          <p className="text-sm font-medium">
            Account closing on{" "}
            {fmtDateLongZA(addCalendarMonths(saDateISO(new Date(fullSub.cancelled_at)), 12))}
          </p>
          <p className="text-xs text-muted-foreground">
            Reads and exports are available until then. You can reactivate at any time.
          </p>
        </div>
      )}

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
      {!isTrialing && !isCancelled && (
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
              <StatusBadge status={liveStatus === "active" && !isPaused ? "active" : "arrears"} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl">
                {monthlyPrice === 0 ? "Free" : formatZAR(monthlyPrice)}
              </span>
              {monthlyPrice > 0 && <span className="text-muted-foreground text-sm">/month</span>}
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

            {/* ── Subscription controls ── */}
            {(canPause || canResume || canCancel) && (
              <div className="pt-2 border-t border-rule flex flex-col gap-2">
                {canResume && (
                  <ActionButton tone="secondary" className="w-full" onClick={handleResume} disabled={resumePending}>
                    {resumePending ? "Resuming…" : "Resume subscription"}
                  </ActionButton>
                )}
                {canPause && (
                  <ActionButton tone="secondary" className="w-full" onClick={() => setPauseOpen(true)}>
                    Pause subscription
                  </ActionButton>
                )}
                {canCancel && tier !== "owner" && (
                  <ActionButton
                    tone="secondary"
                    className="w-full text-muted-foreground hover:text-destructive"
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel subscription
                  </ActionButton>
                )}
              </div>
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

      {/* ── Dialogs ── */}
      <PauseDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        onSuccess={() => {
          setActionFeedback({ type: "success", msg: "Subscription paused." })
          globalThis.location.reload()  // full reload so the header bell + org capabilities re-read the new state
        }}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onSuccess={() => {
          setActionFeedback({ type: "success", msg: "Your subscription has been cancelled." })
          globalThis.location.reload()  // full reload so the header bell + org capabilities re-read the new state
        }}
      />
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingPageInner />
    </Suspense>
  )
}
