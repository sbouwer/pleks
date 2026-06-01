"use client"

/**
 * components/identity/IdentityForkBanner.tsx — "your details now update per-role" notice (ADDENDUM_01C §6)
 *
 * Auth:   Rendered only when the server has determined a fork occurred AND this surface isn't dismissed
 * Data:   dismissal persists via dismissForkBanner() → user_profiles.fork_banner_dismissed_{surface}
 * Notes:  DB-backed, per-surface dismissal (per-user, cross-device) — not localStorage. Informs the
 *         why + that details now update per-role + which role THIS surface edits (D-01C-06).
 */
import { useState, useTransition } from "react"
import { Info, X } from "lucide-react"
import { dismissForkBanner } from "@/lib/actions/identityFork"

export function IdentityForkBanner({ surface }: Readonly<{ surface: "agent" | "landlord" }>) {
  const [visible, setVisible] = useState(true)
  const [, startTransition] = useTransition()

  if (!visible) return null

  const roleWord = surface === "agent" ? "personal" : "landlord"

  function handleDismiss() {
    setVisible(false) // optimistic — the banner won't reappear this render; the flag persists below
    startTransition(async () => {
      await dismissForkBanner(surface)
    })
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 mb-4">
      <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Your details now update per role</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          You&apos;ve moved to a plan that manages multiple landlords and properties. Your personal
          details and your landlord details are now kept separately — updating one no longer changes
          the other. Update your {roleWord} details here.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
