"use client"

/**
 * Invisible background sync engine.
 *
 * Called on every mobile app open and when connectivity returns.
 * The user never sees this running — the only visible side-effect is
 * the SyncIndicator dot in the topbar if upload takes longer than 10s.
 *
 * What it does:
 * 1. Fetches the 5-day rolling sync manifest from /api/offline/sync-manifest
 * 2. Downloads inspection templates (rooms + items) for any new/updated inspections
 * 3. Purges inspection data for inspections no longer in the manifest
 * 4. Flushes pending offline writes (item ratings, notes) to the server
 * 5. Flushes pending photo uploads
 */

import {
  saveInspectionData,
  loadInspectionData,
  listSavedInspectionIds,
  deleteSavedInspection,
  getAllPendingPhotos,
  removePendingPhoto,
  type SavedInspection,
} from "./inspectionStore"
import { getAllPendingWrites, removePendingWrite } from "./pendingWrites"

// ── Sync status observable ────────────────────────────────────────────────────

let _syncStartedAt: number | null = null
const _listeners = new Set<() => void>()

function notifyListeners() {
  for (const fn of _listeners) fn()
}

/** Subscribe to sync status changes. Returns unsubscribe function. */
export function onSyncStatusChange(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

export function isSyncing(): boolean { return _syncStartedAt !== null }
export function syncStartedAt(): number | null { return _syncStartedAt }

function setSyncing(active: boolean) {
  _syncStartedAt = active ? Date.now() : null
  notifyListeners()
}

// ── Manifest types ────────────────────────────────────────────────────────────

interface ManifestItem {
  id: string
  hash: string
  updatedAt: string
  data: Record<string, unknown>
}

interface SyncManifest {
  generatedAt: string
  orgId: string
  contacts: ManifestItem[]
  properties: ManifestItem[]
  inspections: ManifestItem[]
  maintenance: ManifestItem[]
}

// In-memory hash cache — avoids IDB reads on repeat syncs within same session
const _knownHashes = new Map<string, string>()

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run a full background sync cycle. Safe to call multiple times — exits
 * immediately if already running or offline.
 */
export async function runBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return
  if (isSyncing()) return

  setSyncing(true)
  try {
    const res = await fetch("/api/offline/sync-manifest", { credentials: "include" })
    if (!res.ok) return  // 401, 500, network error — silently exit

    const manifest = await res.json() as SyncManifest

    await syncInspectionTemplates(manifest.inspections)
    await purgeStaleInspections(manifest.inspections)
    await flushPendingWrites()
    await flushPendingPhotos()
  } catch {
    // Silently fail — IDB data from last successful sync is still available
  } finally {
    setSyncing(false)
  }
}

// ── Inspection template sync ──────────────────────────────────────────────────

async function syncInspectionTemplates(items: ManifestItem[]): Promise<void> {
  for (const item of items) {
    // Skip if we already have this version in memory
    if (_knownHashes.get(item.id) === item.hash) continue

    // Check IDB — a more recently saved version (offline edits) takes priority
    const stored = await loadInspectionData(item.id)
    if (stored?.savedAt && stored.savedAt > item.updatedAt) {
      _knownHashes.set(item.id, item.hash)
      continue
    }

    try {
      const dataRes = await fetch(`/api/inspection/${item.id}/offline-data`, {
        credentials: "include",
      })
      if (!dataRes.ok) continue

      const data = await dataRes.json() as Omit<SavedInspection, "savedAt">
      await saveInspectionData(data)
      _knownHashes.set(item.id, item.hash)
    } catch {
      // Skip this inspection — try again next sync cycle
    }
  }
}

// ── Stale data purge ──────────────────────────────────────────────────────────

async function purgeStaleInspections(currentItems: ManifestItem[]): Promise<void> {
  const currentIds = new Set(currentItems.map((i) => i.id))
  const savedIds = await listSavedInspectionIds()

  for (const id of savedIds) {
    if (!currentIds.has(id)) {
      await deleteSavedInspection(id).catch(() => {})
      _knownHashes.delete(id)
    }
  }
}

// ── Pending writes flush ──────────────────────────────────────────────────────

async function flushPendingWrites(): Promise<void> {
  const writes = await getAllPendingWrites()
  if (writes.length === 0) return

  for (const write of writes) {
    if (write.type === "inspection_item_condition") {
      try {
        const res = await fetch(`/api/inspection/${write.inspectionId}/item-condition`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            itemId: write.itemId,
            condition: write.condition,
            notes: write.notes,
          }),
        })
        if (res.ok) {
          await removePendingWrite(write.id)
        }
        // On non-ok: leave in queue, retry next sync cycle
      } catch {
        // Network error — leave in queue
      }
    }
  }
}

// ── Pending photos flush ──────────────────────────────────────────────────────

async function flushPendingPhotos(): Promise<void> {
  const photos = await getAllPendingPhotos()
  if (photos.length === 0) return

  for (const photo of photos) {
    try {
      const fd = new FormData()
      fd.append("file", photo.blob, photo.filename)
      if (photo.roomId) fd.append("roomId", photo.roomId)
      if (photo.itemId) fd.append("itemId", photo.itemId)

      const res = await fetch(photo.uploadUrl, {
        method: "POST",
        body: fd,
        credentials: "include",
      })

      if (res.ok) {
        await removePendingPhoto(photo.id)
      }
    } catch {
      // Leave in queue for next sync
    }
  }
}
