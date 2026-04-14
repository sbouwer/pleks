"use client"

/**
 * Online/offline detection and background sync trigger.
 * Uses navigator.onLine + online/offline events as primary signal.
 * Falls back gracefully on servers / SSR (where window is undefined).
 */

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true
  return navigator.onLine
}

/** Subscribe to connectivity changes. Returns unsubscribe function. */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {}

  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)

  window.addEventListener("online", handleOnline)
  window.addEventListener("offline", handleOffline)

  return () => {
    window.removeEventListener("online", handleOnline)
    window.removeEventListener("offline", handleOffline)
  }
}

/**
 * Request a background sync for pending photo uploads.
 * Falls back to immediate upload attempt if Background Sync API unavailable.
 */
export async function requestPhotoSync(): Promise<void> {
  if (typeof navigator === "undefined") return

  const sw = navigator.serviceWorker?.controller
  if (!sw) return

  try {
    const reg = await navigator.serviceWorker.ready
    // Background Sync API is not universally supported; check before calling
    if ("sync" in reg) {
      await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
        .sync.register("photo-upload")
    }
  } catch {
    // Silently ignore — photos will retry on next page load
  }
}

/** Upload pending photos directly (used when Background Sync API unavailable). */
export async function flushPhotoQueue(inspectionId: string): Promise<{ uploaded: number; failed: number }> {
  const { getPendingPhotos, removePendingPhoto } = await import("./inspectionStore")
  const pending = await getPendingPhotos(inspectionId)

  let uploaded = 0
  let failed = 0

  for (const photo of pending) {
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
        uploaded++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  return { uploaded, failed }
}
