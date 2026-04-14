"use client"

import { saveInspectionData, loadInspectionData, listSavedInspectionIds, type SavedInspection } from "./inspectionStore"

/**
 * Download and cache the full inspection data for offline use.
 * Calls /api/inspection/[id]/offline-data and stores in IndexedDB.
 * The original file is not stored — only structured data (rooms + items).
 */
export async function downloadForOffline(inspectionId: string): Promise<void> {
  const res = await fetch(`/api/inspection/${inspectionId}/offline-data`, {
    credentials: "include",
  })
  if (!res.ok) {
    const body = await res.json() as { error?: string }
    throw new Error(body.error ?? `Download failed (${res.status})`)
  }
  const data = await res.json() as Omit<SavedInspection, "savedAt">
  await saveInspectionData(data)
}

/** True if this inspection has been downloaded for offline use. */
export async function isOfflineReady(inspectionId: string): Promise<boolean> {
  const data = await loadInspectionData(inspectionId)
  return data !== undefined
}

/** Returns all inspection IDs currently saved for offline. */
export async function getSavedIds(): Promise<string[]> {
  return listSavedInspectionIds()
}
