"use client"

import { useState, useEffect } from "react"
import { X, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface UpgradeCtaProps {
  title: string
  description: string
  dismissKey: string // localStorage key — 30-day expiry
}

export function UpgradeCta({ title, description, dismissKey }: UpgradeCtaProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(dismissKey)
      if (raw) {
        const { dismissedAt } = JSON.parse(raw) as { dismissedAt: number }
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
        if (Date.now() - dismissedAt < thirtyDaysMs) return
      }
    } catch {
      // ignore parse errors
    }
    setVisible(true)
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
        <Button
          size="sm"
          variant="outline"
          className="mt-3 h-7 text-xs gap-1"
          render={<Link href="/settings/billing" />}
        >
          Compare plans <ArrowUpRight className="size-3" />
        </Button>
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
