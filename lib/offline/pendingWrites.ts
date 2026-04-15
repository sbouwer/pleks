"use client"

/**
 * IndexedDB write queue for non-photo offline writes.
 * When the agent rates an item or adds a note while offline, the write is
 * queued here. syncEngine.flushPendingWrites() replays them when back online.
 *
 * Idempotency: each write has a stable `id` derived from its target
 * (e.g. `${inspectionId}:${itemId}:condition`). Re-queuing the same write
 * overwrites the previous entry — only the latest value is sent to the server.
 */

import { openDB } from "./inspectionStore"

export interface PendingWrite {
  id: string          // stable idempotency key, e.g. `${inspectionId}:${itemId}:condition`
  type: "inspection_item_condition"
  inspectionId: string
  itemId: string
  condition: string
  notes: string
  queuedAt: string
  attempts: number
}

export async function queueWrite(write: Omit<PendingWrite, "queuedAt" | "attempts">): Promise<void> {
  const db = await openDB()
  const tx = db.transaction("pendingWrites", "readwrite")
  return new Promise((resolve, reject) => {
    const req = tx.objectStore("pendingWrites").put({
      ...write,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

export async function getAllPendingWrites(): Promise<PendingWrite[]> {
  const db = await openDB()
  const tx = db.transaction("pendingWrites", "readonly")
  return new Promise((resolve, reject) => {
    const req = tx.objectStore("pendingWrites").getAll()
    req.onsuccess = () => resolve(req.result as PendingWrite[])
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

export async function removePendingWrite(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction("pendingWrites", "readwrite")
  return new Promise((resolve, reject) => {
    const req = tx.objectStore("pendingWrites").delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}
