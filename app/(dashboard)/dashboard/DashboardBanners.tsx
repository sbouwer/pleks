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
}

export function DashboardBanners({ showTrustBanner, isTrialing, trialDaysLeft, trialTier }: DashboardBannersProps) {
  return (
    <>
      {/* Trial banner */}
      {isTrialing && trialDaysLeft != null && (
        <Card className={`mb-6 ${
          trialDaysLeft <= 2
            ? "border-red-300 bg-red-50 dark:bg-red-950/20"
            : trialDaysLeft <= 7
              ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
              : "border-brand/30 bg-brand-dim/30"
        }`}>
          <CardContent className="flex items-center gap-3 pt-4">
            {trialDaysLeft <= 2 ? (
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            ) : trialDaysLeft <= 7 ? (
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
            ) : (
              <Sparkles className="h-5 w-5 text-brand shrink-0" />
            )}
            <div className="flex-1">
              {trialDaysLeft <= 2 ? (
                <>
                  <p className="text-sm font-medium text-red-800 dark:text-red-400">
                    Your trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}!
                  </p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80">
                    After that you&apos;ll move to the free Owner plan.
                  </p>
                </>
              ) : trialDaysLeft <= 7 ? (
                <>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                    Your {trialTier ?? "Steward"} trial ends in {trialDaysLeft} days.
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                    Upgrade now to keep bank recon, DebiCheck, and owner statements.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    You&apos;re on a 14-day {trialTier ?? "Steward"} trial.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {trialDaysLeft} days remaining. No credit card required.
                  </p>
                </>
              )}
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
