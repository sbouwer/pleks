"use client"

/**
 * components/layout/MobileOfflineSheet.tsx — offline & sync status (opened from the More sheet)
 *
 * Auth:   dashboard layout (gateway)
 * Data:   lib/offline — connectivity (syncManager), sync state (syncEngine), and IndexedDB queue counts
 *         (pending photos, pending writes, cached inspections)
 * Notes:  Field agents work inspections offline; this surfaces what's stored locally and what's waiting
 *         to upload, with a manual "Sync now". All reads are client-side IndexedDB.
 */

import { useCallback, useEffect, useState } from "react"
import { Wifi, WifiOff, RefreshCw, ClipboardCheck, ImageUp, PencilLine, Loader2, CheckCircle2, Users, Building2 } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { isOnline, onConnectivityChange } from "@/lib/offline/syncManager"
import { isSyncing, onSyncStatusChange, runBackgroundSync } from "@/lib/offline/syncEngine"
import { getAllPendingPhotos, listSavedInspectionIds } from "@/lib/offline/inspectionStore"
import { getAllPendingWrites } from "@/lib/offline/pendingWrites"
import { cacheReferenceData, getReferenceCounts, type ReferenceCounts } from "@/lib/offline/referenceCache"

interface MobileOfflineSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

interface Counts {
  cached: number
  photos: number
  writes: number
}

function StatRow({
  icon: Icon,
  label,
  value,
  tone,
}: Readonly<{ icon: React.ElementType; label: string; value: number; tone?: "default" | "amber" }>) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-3">
        <Icon className="h-[18px] w-[18px] text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-sm font-bold tabular-nums ${tone === "amber" && value > 0 ? "text-brand" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  )
}

export function MobileOfflineSheet({ open, onOpenChange }: MobileOfflineSheetProps) {
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [counts, setCounts] = useState<Counts>({ cached: 0, photos: 0, writes: 0 })
  const [reference, setReference] = useState<ReferenceCounts>({ contacts: 0, properties: 0, lastSynced: null })

  const refreshCounts = useCallback(async () => {
    try {
      const [cachedIds, photos, writes, ref] = await Promise.all([
        listSavedInspectionIds(),
        getAllPendingPhotos(),
        getAllPendingWrites(),
        getReferenceCounts(),
      ])
      setCounts({ cached: cachedIds.length, photos: photos.length, writes: writes.length })
      setReference(ref)
    } catch (e) {
      console.error("offline counts:", e)
    }
  }, [])

  // Track connectivity + sync state while the sheet is mounted.
  useEffect(() => {
    setOnline(isOnline())
    setSyncing(isSyncing())
    const offConn = onConnectivityChange(setOnline)
    const offSync = onSyncStatusChange(() => setSyncing(isSyncing()))
    return () => {
      offConn()
      offSync()
    }
  }, [])

  // Refresh queue counts whenever the sheet opens or a sync finishes.
  useEffect(() => {
    if (open) void refreshCounts()
  }, [open, syncing, refreshCounts])

  const pendingTotal = counts.photos + counts.writes

  async function handleSync() {
    await Promise.all([runBackgroundSync(), cacheReferenceData()])
    await refreshCounts()
  }

  const lastSyncedLabel = reference.lastSynced
    ? new Date(reference.lastSynced).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "never"

  let connectivitySub: string
  if (!online) connectivitySub = "Changes are saved on this device and sync when you're back online."
  else if (pendingTotal > 0) connectivitySub = "Connected — changes are ready to upload."
  else connectivitySub = "Connected — everything is up to date."

  let syncLabel: React.ReactNode
  if (syncing) syncLabel = (<><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>)
  else if (pendingTotal === 0) syncLabel = (<><CheckCircle2 className="h-4 w-4" /> All synced</>)
  else syncLabel = (<><RefreshCw className="h-4 w-4" /> Sync now</>)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl p-0">
        <SheetHeader className="px-4 pt-4 pb-1">
          <SheetTitle className="text-base font-semibold">Offline &amp; sync</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Connectivity banner */}
          <div
            className={`flex items-center gap-3 rounded-[var(--r-button)] border px-4 py-3 ${
              online ? "border-border bg-card" : "border-orange-400/40 bg-orange-400/10"
            }`}
          >
            {online ? (
              <Wifi className="h-5 w-5 text-emerald-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-orange-500" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{online ? "Online" : "Offline"}</p>
              <p className="text-xs text-muted-foreground">{connectivitySub}</p>
            </div>
          </div>

          {/* Available offline (read cache) */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Available offline</p>
            <div className="rounded-[var(--r-button)] border border-border bg-card overflow-hidden">
              <StatRow icon={Users} label="Contacts" value={reference.contacts} />
              <StatRow icon={Building2} label="Properties" value={reference.properties} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Last updated {lastSyncedLabel} · search them anytime, even offline.</p>
          </div>

          {/* Pending capture queue */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Pending upload</p>
            <div className="rounded-[var(--r-button)] border border-border bg-card overflow-hidden">
              <StatRow icon={ClipboardCheck} label="Inspections saved offline" value={counts.cached} />
              <StatRow icon={ImageUp} label="Photos waiting to upload" value={counts.photos} tone="amber" />
              <StatRow icon={PencilLine} label="Changes waiting to sync" value={counts.writes} tone="amber" />
            </div>
          </div>

          {/* Sync action */}
          <button
            type="button"
            onClick={handleSync}
            disabled={!online || syncing}
            className="w-full flex items-center justify-center gap-2 rounded-[var(--r-button)] bg-primary text-primary-foreground py-3 text-sm font-medium disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {syncLabel}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
