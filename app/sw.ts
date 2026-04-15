/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { Serwist } from "serwist"

// Extend ServiceWorkerGlobalScope with serwist injection point
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

// Background Sync API type (not yet in standard TS lib)
interface SyncEvent extends ExtendableEvent {
  readonly tag: string
}

// Periodic Sync API type (Chrome Android, not in standard TS lib)
interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()

// One-shot background sync: upload pending photos when back online
self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "photo-upload") {
    event.waitUntil(uploadPendingPhotos())
  }
})

// Periodic background sync (Chrome Android): keep data fresh every 6 hours
self.addEventListener("periodicsync", ((event: PeriodicSyncEvent) => {
  if (event.tag === "pleks-sync") {
    event.waitUntil(uploadPendingPhotos())
  }
}) as EventListenerOrEventListenerObject)

async function uploadPendingPhotos(): Promise<void> {
  const db = await openOfflineDB()
  const tx = db.transaction("photoQueue", "readwrite")
  const store = tx.objectStore("photoQueue")
  const all = await idbGetAll(store)

  for (const item of all) {
    try {
      const fd = new FormData()
      fd.append("file", item.blob, item.filename)
      if (item.roomId) fd.append("roomId", item.roomId)
      if (item.itemId) fd.append("itemId", item.itemId)

      const res = await fetch(item.uploadUrl, {
        method: "POST",
        body: fd,
        credentials: "include",
      })

      if (res.ok) {
        const deleteTx = db.transaction("photoQueue", "readwrite")
        deleteTx.objectStore("photoQueue").delete(item.id)
        await new Promise<void>((resolve, reject) => {
          deleteTx.oncomplete = () => resolve()
          deleteTx.onerror = () => reject(new Error(deleteTx.error?.message ?? "IDB error"))
        })
      }
    } catch {
      // Leave in queue for next sync attempt
    }
  }
}

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Open at current version — IDB returns the DB at whatever version it's at
    const req = indexedDB.open("pleks_offline")
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB open failed"))
  })
}

function idbGetAll(store: IDBObjectStore): Promise<Array<{
  id: string
  uploadUrl: string
  blob: Blob
  filename: string
  roomId?: string
  itemId?: string
}>> {
  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}
