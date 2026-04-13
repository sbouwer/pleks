"use client"

import { useEffect, useCallback, useState } from "react"
import { useRouter } from "next/navigation"

const GO_ROUTES: Record<string, string> = {
  p: "/properties",
  l: "/leases",
  t: "/tenants",
  m: "/maintenance",
  i: "/inspections",
  d: "/dashboard",
  a: "/payments/arrears",
  c: "/contractors",
}

const HELP_ITEMS = [
  { keys: "G  P", label: "Go to Properties" },
  { keys: "G  L", label: "Go to Leases" },
  { keys: "G  T", label: "Go to Tenants" },
  { keys: "G  M", label: "Go to Maintenance" },
  { keys: "G  I", label: "Go to Inspections" },
  { keys: "G  D", label: "Go to Dashboard" },
  { keys: "G  A", label: "Go to Arrears" },
  { keys: "G  C", label: "Go to Contractors" },
  { keys: "?", label: "Show / hide shortcuts" },
  { keys: "Esc", label: "Dismiss" },
]

export function KeyboardShortcuts() {
  const router = useRouter()
  const [gMode, setGMode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      ) {
        return
      }

      if (e.key === "Escape") {
        setGMode(false)
        setShowHelp(false)
        return
      }

      if (e.key === "?") {
        setShowHelp((s) => !s)
        return
      }

      if (gMode) {
        setGMode(false)
        const dest = GO_ROUTES[e.key.toLowerCase()]
        if (dest) router.push(dest)
        return
      }

      if (e.key.toLowerCase() === "g" && !e.ctrlKey && !e.metaKey) {
        setGMode(true)
        setTimeout(() => setGMode(false), 1500)
      }
    },
    [gMode, router],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [handleKey])

  if (showHelp) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        onClick={() => setShowHelp(false)}
      >
        <div
          className="bg-background border border-border rounded-xl p-6 shadow-xl max-w-xs w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Keyboard shortcuts
          </p>
          <div className="space-y-2.5 text-sm">
            {HELP_ITEMS.map(({ keys, label }) => (
              <div key={keys} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <kbd className="shrink-0 px-2 py-0.5 text-xs bg-muted rounded font-mono">{keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (gMode) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border border-border rounded-lg px-4 py-2 text-sm shadow-lg pointer-events-none">
        Go to…{" "}
        <span className="text-muted-foreground font-mono text-xs">P · L · T · M · I · D · A · C</span>
      </div>
    )
  }

  return null
}
