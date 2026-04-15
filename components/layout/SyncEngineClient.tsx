"use client"

/**
 * Headless component — wires the invisible sync engine into the app.
 * Rendered in the dashboard layout; does nothing on desktop.
 *
 * On mobile:
 * - Runs a full sync on every app open (mount)
 * - Re-runs sync whenever connectivity returns
 * - Registers Chrome Android periodic background sync (every 6 hours)
 */

import { useEffect } from "react"
import { useIsMobile } from "@/hooks/useIsMobile"
import { onConnectivityChange } from "@/lib/offline/syncManager"

type PeriodicSyncManager = {
  register(tag: string, options: { minInterval: number }): Promise<void>
}

export function SyncEngineClient() {
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isMobile) return

    // Lazy-import so the sync engine bundle is never loaded on desktop
    const triggerSync = () => {
      import("@/lib/offline/syncEngine")
        .then(({ runBackgroundSync }) => { void runBackgroundSync() })
        .catch(() => {})
    }

    // Sync on app open
    triggerSync()

    // Re-sync when connectivity returns
    const unsub = onConnectivityChange((online) => {
      if (online) triggerSync()
    })

    // Register periodic background sync (Chrome Android only — graceful fallback)
    navigator.serviceWorker?.ready
      .then((reg) => {
        if ("periodicSync" in reg) {
          return (reg as ServiceWorkerRegistration & { periodicSync: PeriodicSyncManager })
            .periodicSync.register("pleks-sync", { minInterval: 6 * 60 * 60 * 1000 })
        }
      })
      .catch(() => {})  // permission denied or unsupported — silent fallback

    return unsub
  }, [isMobile])

  return null
}
