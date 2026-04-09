"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Clock, Sparkles } from "lucide-react"
import Link from "next/link"

interface DashboardBannersProps {
  readonly showTrustBanner: boolean
  readonly isTrialing?: boolean
  readonly trialDaysLeft?: number | null
  readonly trialTier?: string | null
  readonly isFoundingAgent?: boolean
  readonly foundingPriceCents?: number | null
}

function TrialIcon({ daysLeft }: Readonly<{ daysLeft: number }>) {
  if (daysLeft <= 2) return <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
  if (daysLeft <= 7) return <Clock className="h-5 w-5 text-amber-600 shrink-0" />
  return <Sparkles className="h-5 w-5 text-brand shrink-0" />
}

function TrialContent({ daysLeft, trialTier, isFoundingAgent, foundingPriceCents }: Readonly<{
  daysLeft: number
  trialTier?: string | null
  isFoundingAgent?: boolean
  foundingPriceCents?: number | null
}>) {
  if (daysLeft <= 2) {
    return (
      <>
        <p className="text-sm font-medium text-red-800 dark:text-red-400">
          Your trial ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}!
        </p>
        <p className="text-xs text-red-600/80 dark:text-red-400/80">
          After that you&apos;ll move to the free Owner plan.
        </p>
      </>
    )
  }
  if (daysLeft <= 7) {
    return (
      <>
        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
          Your {trialTier ?? "Steward"} trial ends in {daysLeft} days.
        </p>
        <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
          Upgrade now to keep bank recon, DebiCheck, and owner statements.
        </p>
      </>
    )
  }
  return (
    <>
      <p className="text-sm font-medium">
        You&apos;re on a 14-day {trialTier ?? "Steward"} trial.
      </p>
      <p className="text-xs text-muted-foreground">
        {daysLeft} days remaining. No credit card required.
        {isFoundingAgent && foundingPriceCents && (
          <span className="block mt-0.5 text-amber-600 dark:text-amber-400">
            Founding price: R{(foundingPriceCents / 100).toLocaleString()}/month for 24 months.
          </span>
        )}
      </p>
    </>
  )
}

export function DashboardBanners({ showTrustBanner, isTrialing, trialDaysLeft, trialTier, isFoundingAgent, foundingPriceCents }: DashboardBannersProps) {
  let trialCardClass = "border-brand/30 bg-brand-dim/30"
  if (trialDaysLeft != null && trialDaysLeft <= 2) { trialCardClass = "border-red-300 bg-red-50 dark:bg-red-950/20" }
  else if (trialDaysLeft != null && trialDaysLeft <= 7) { trialCardClass = "border-amber-300 bg-amber-50 dark:bg-amber-950/20" }

  return (
    <>
      {/* Trial banner */}
      {isTrialing && trialDaysLeft != null && (
        <Card className={`mb-6 ${trialCardClass}`}>
          <CardContent className="flex items-center gap-3 pt-4">
            <TrialIcon daysLeft={trialDaysLeft} />
            <div className="flex-1">
              <TrialContent
                daysLeft={trialDaysLeft}
                trialTier={trialTier}
                isFoundingAgent={isFoundingAgent}
                foundingPriceCents={foundingPriceCents}
              />
            </div>
            <Button
              size="sm"
              variant={trialDaysLeft <= 2 ? "destructive" : "default"}
              render={<Link href="/settings/billing" />}
            >
              {trialDaysLeft <= 7 ? "Upgrade now" : "Upgrade"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Trust account banner */}
      {showTrustBanner && (
        <Card className="mb-6 border-warning/30 bg-warning-bg">
          <CardContent className="flex items-center gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Deposit management restricted</p>
              <p className="text-xs text-muted-foreground">
                Add your trust account to unlock full deposit management.
              </p>
            </div>
            <Button size="sm" variant="outline" render={<Link href="/settings/compliance" />}>
              Add Account
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}
