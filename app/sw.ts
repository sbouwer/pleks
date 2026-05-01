/// <reference lib="webworker" />
/**
 * app/sw.ts — Service worker: offline sync + curated runtime cache
 *
 * Notes:  defaultCache from @serwist/next/worker caches all /api/* GET for 24h via
 *         NetworkFirst — bad for authenticated data. Replaced with a curated list:
 *         deploy-hashed static assets get CacheFirst; everything else is short or NetworkOnly.
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  Serwist,
} from "serwist"

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
  runtimeCaching: [
    // Deploy-hashed static assets — URL changes with each build, safe to cache aggressively
    {
      matcher: /\/_next\/static\/.+/i,
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    // Images — stale-while-revalidate (most images are stable enough)
    {
      matcher: /\.(?:jpg|jpeg|png|svg|webp|ico|gif)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "images",
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    // Web fonts — long-lived, cache-first
    {
      matcher: /\.(?:woff2?|ttf|otf)$/i,
      handler: new CacheFirst({
        cacheName: "fonts",
        plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // API routes — never cache. Auth, data, mutations — all go to network.
    {
      matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // RSC prefetch payloads — 1h instead of defaultCache's 24h; stale builds clear quickly
    {
      matcher: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
        sameOrigin && request.headers.get("RSC") === "1",
      handler: new NetworkFirst({
        cacheName: "rsc",
        plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 60 * 60 })],
        networkTimeoutSeconds: 5,
      }),
    },
    // HTML navigation — network first, 1h offline fallback
    {
      matcher: ({ request, sameOrigin, url }: { request: Request; sameOrigin: boolean; url: URL }) =>
        sameOrigin &&
        (request.headers.get("Accept") ?? "").includes("text/html") &&
        !url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages",
        plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 60 * 60 })],
        networkTimeoutSeconds: 5,
      }),
    },
  ],
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
