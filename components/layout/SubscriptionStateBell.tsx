"use client"

/**
 * components/layout/SubscriptionStateBell.tsx — header bell for subscription dunning/lockdown state
 *
 * Notes: Replaces the full-width SubscriptionStateBanner (which pushed the whole header down). A header
 *        icon next to the theme toggle: amber Pause when paused, red alert when past-due (arrears), amber
 *        clock when cancelled/closing. Click → modal with the state copy + CTA to Settings → Subscription.
 *        Reads subscriptionStateVariant from useOrgCapabilities (null while loading → renders nothing).
 *        The dashboard alerts bell mirrors this under "Plan" (intentional double-up — hard to miss).
 */
import { useState } from "react"
import Link from "next/link"
import { Pause, AlertCircle, Clock, type LucideIcon } from "lucide-react"
import { Modal } from "@/components/ui/actions"
import { useOrgCapabilities } from "@/hooks/useOrgCapabilities"
import { useOrg } from "@/hooks/useOrg"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function purgeDate(cancelledAt: string | null): string {
  if (!cancelledAt) return "in 12 months"
  const d = new Date(cancelledAt)
  d.setFullYear(d.getFullYear() + 1)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

interface VariantCfg {
  Icon: LucideIcon
  tone: string
  dot: string
  label: string
  title: string
  body: string
  cta: string
}

export function SubscriptionStateBell() {
  const caps = useOrgCapabilities()
  const { cancelledAt } = useOrg()
  const [open, setOpen] = useState(false)

  if (!caps) return null
  const v = caps.subscriptionStateVariant
  if (v === "normal") return null

  const byVariant: Record<"past_due" | "paused" | "cancelled", VariantCfg> = {
    past_due: {
      Icon: AlertCircle, tone: "text-red-600 dark:text-red-400", dot: "bg-red-500",
      label: "Payment overdue",
      title: "Payment didn't go through",
      body: "Your last payment didn't go through — PayFast will retry over the next few days, so there's nothing you need to do yet. To update your payment details, open Settings → Subscription.",
      cta: "Open subscription",
    },
    paused: {
      Icon: Pause, tone: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500",
      label: "Subscription paused",
      title: "Your subscription is paused",
      body: "You can read, export, and audit everything — but new leases, edits, and submissions are off until the bill is settled.",
      cta: "Resume subscription",
    },
    cancelled: {
      Icon: Clock, tone: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500",
      label: "Account closing",
      title: `Your account is closing on ${purgeDate(cancelledAt)}`,
      body: "That's 12 months from cancellation. Reads and exports stay open the whole time — reactivate any time before then.",
      cta: "Reactivate",
    },
  }
  // Only the three lockdown/dunning states get a bell (dormant_warning etc. are silent, as the old banner was).
  const cfg = (byVariant as Record<string, VariantCfg>)[v]
  if (!cfg) return null
  const { Icon } = cfg

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pa-iconbtn relative" aria-label={cfg.label} title={cfg.label}>
        <Icon size={15} className={cfg.tone} />
        <span className={`absolute right-1 top-1 size-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      </button>

      {open && (
        <Modal open onClose={() => setOpen(false)} title={cfg.title} icon={<Icon className={`size-5 ${cfg.tone}`} />}>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground">{cfg.body}</p>
            <Link
              href="/settings/subscription"
              onClick={() => setOpen(false)}
              className="self-start rounded-[var(--r-button)] bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-primary"
            >
              {cfg.cta} →
            </Link>
          </div>
        </Modal>
      )}
    </>
  )
}
