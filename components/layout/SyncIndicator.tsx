"use client"

import { useEffect, useState } from "react"
import { isSyncing, syncStartedAt, onSyncStatusChange } from "@/lib/offline/syncEngine"
import { useIsMobile } from "@/hooks/useIsMobile"

/**
 * Shows "• Syncing" in the topbar only when:
 * - On mobile
 * - A sync is actively running
 * - The sync has been running for more than 10 seconds
 *
 * Disappears the moment sync completes. No progress bar, no count.
 */
export function SyncIndicator() {
  const isMobile = useIsMobile()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isMobile) return

    let timer: ReturnType<typeof setTimeout> | null = null

    function update() {
      if (!isSyncing()) {
        setShow(false)
        if (timer) { clearTimeout(timer); timer = null }
        return
      }

      const started = syncStartedAt()
      const elapsed = started ? Date.now() - started : 0

      if (elapsed >= 10_000) {
        setShow(true)
      } else {
        timer = setTimeout(() => {
          if (isSyncing()) setShow(true)
        }, 10_000 - elapsed)
      }
    }

    update()
    const unsub = onSyncStatusChange(update)

    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [isMobile])

  if (!show) return null

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
      <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse flex-shrink-0" />
      Syncing
    </span>
  )
}
