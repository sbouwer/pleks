"use client"

/**
 * components/shared/UpgradeCta.tsx — dismissible upgrade prompt linking to the subscription/plans page
 *
 * Notes:  Dismissal is persisted in localStorage under dismissKey with a 30-day expiry; starts hidden on
 *         both server and client render (visibility set in useEffect) to avoid a hydration mismatch.
 */

import { useState, useEffect } from "react"
import { X, ArrowUpRight } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import Link from "next/link"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function shouldShow(dismissKey: string): boolean {
  try {
    const raw = localStorage.getItem(dismissKey)
    if (raw) {
      const { dismissedAt } = JSON.parse(raw) as { dismissedAt: number }
      if (Date.now() - dismissedAt < THIRTY_DAYS_MS) return false
    }
  } catch {
    // ignore parse errors
  }
  return true
}

interface UpgradeCtaProps {
  readonly title: string
  readonly description: string
  readonly dismissKey: string // localStorage key — 30-day expiry
}

export function UpgradeCta({ title, description, dismissKey }: UpgradeCtaProps) {
  // Always start false so server and client render identically (no hydration mismatch).
  // useEffect runs only on the client, after hydration, and sets visible from localStorage.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (shouldShow(dismissKey)) setVisible(true)
  }, [dismissKey])

  function dismiss() {
    try {
      localStorage.setItem(dismissKey, JSON.stringify({ dismissedAt: Date.now() }))
    } catch {
      // ignore storage errors
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="relative flex items-start gap-4 rounded-xl border border-border/50 bg-muted/20 px-5 py-4 mt-6">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        <ActionButton asChild tone="secondary" size="sm" className="mt-3 h-7 text-xs gap-1">
          <Link href="/settings/subscription">
            Compare plans <ArrowUpRight className="size-3" />
          </Link>
        </ActionButton>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
