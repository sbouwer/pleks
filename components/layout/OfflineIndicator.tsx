"use client"

import { useEffect, useState } from "react"
import { onConnectivityChange, isOnline } from "@/lib/offline/syncManager"

interface SyncState {
  syncing: boolean
  count: number
}

export function OfflineIndicator() {
  const [online, setOnline] = useState(() => globalThis.window === undefined || isOnline())
  const [sync, setSync] = useState<SyncState>({ syncing: false, count: 0 })

  useEffect(() => {
    const unsub = onConnectivityChange((nowOnline) => {
      setOnline(nowOnline)
      if (nowOnline) {
        // Trigger sync check after short delay so SW has time to connect
        const t = setTimeout(() => setSync({ syncing: false, count: 0 }), 3000)
        return () => clearTimeout(t)
      }
    })
    return unsub
  }, [])

  // Listen for sync progress messages from service worker
  useEffect(() => {
    if (typeof navigator === "undefined") return
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "SYNC_PROGRESS") {
        setSync({ syncing: event.data.syncing as boolean, count: event.data.count as number })
      }
    }
    navigator.serviceWorker?.addEventListener("message", handleMessage)
    return () => navigator.serviceWorker?.removeEventListener("message", handleMessage)
  }, [])

  if (online && !sync.syncing) return null

  if (sync.syncing) {
    return (
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-emerald-600 text-white text-xs text-center py-1.5 px-4">
        Syncing {sync.count} photo{sync.count === 1 ? "" : "s"}…
      </div>
    )
  }

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white text-xs text-center py-1.5 px-4">
      Offline — changes will sync when you&apos;re back online
    </div>
  )
}
