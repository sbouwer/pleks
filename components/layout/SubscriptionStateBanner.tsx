"use client"

/**
 * components/layout/SubscriptionStateBanner.tsx — Agent-workspace dunning and lockdown banner
 *
 * Notes: Reads subscriptionStateVariant from useOrgCapabilities() (null while loading → renders nothing).
 *        past_due = amber advisory, no lockdown. paused/cancelled = lockdown with CTA.
 *        Copy variants verbatim from ADDENDUM_57G §10.1. Never red — a paused customer is still a customer.
 */

import Link from "next/link"
import { useOrgCapabilities } from "@/hooks/useOrgCapabilities"
import { useOrg } from "@/hooks/useOrg"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function purgeDate(cancelledAt: string | null): string {
  if (!cancelledAt) return "in 12 months"
  const d = new Date(cancelledAt)
  d.setFullYear(d.getFullYear() + 1)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function SubscriptionStateBanner() {
  const caps = useOrgCapabilities()
  const { cancelledAt } = useOrg()

  if (!caps) return null
  const { subscriptionStateVariant } = caps
  if (subscriptionStateVariant === "normal") return null

  if (subscriptionStateVariant === "past_due") {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        Your last payment didn&apos;t go through. PayFast will retry over the next few days. To update your payment
        details,{" "}
        <Link
          href="/settings/subscription"
          className="underline underline-offset-2 hover:text-amber-700"
        >
          open Settings → Subscription
        </Link>
        . No action needed yet.
      </div>
    )
  }

  if (subscriptionStateVariant === "paused") {
    return (
      <div className="border-b border-amber-400 bg-amber-100 px-4 py-2.5 text-sm text-amber-950">
        <span className="mr-1" aria-hidden>⏸</span>
        <strong>Your subscription is paused.</strong> You can read, export, and audit everything — but new
        leases, edits, and submissions are off until the bill is settled.
        <Link
          href="/settings/subscription"
          className="ml-3 underline underline-offset-2 hover:text-amber-800"
        >
          Resume subscription →
        </Link>
      </div>
    )
  }

  if (subscriptionStateVariant === "cancelled") {
    return (
      <div className="flex items-center gap-4 border-b border-b-neutral-700 border-l-4 border-l-amber-400 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100">
        <span className="shrink-0" aria-hidden>⏳</span>
        <span>
          <strong>Your account is closing on {purgeDate(cancelledAt)}</strong> (12 months from cancel).
          Reads + exports stay open. Reactivate any time before then.
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          <Link
            href="/settings/subscription"
            className="underline underline-offset-2 hover:text-amber-300"
          >
            Reactivate →
          </Link>
          <Link
            href="/reports"
            className="underline underline-offset-2 hover:text-amber-300"
          >
            Export →
          </Link>
        </div>
      </div>
    )
  }

  return null
}
