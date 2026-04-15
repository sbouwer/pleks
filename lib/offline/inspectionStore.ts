/**
 * IndexedDB store for offline inspection data.
 * Used by MobileInspectionView when navigator.onLine is false.
 *
 * Schema (pleks_offline v3):
 *   inspectionMeta     — inspection header, keyed by inspectionId
 *   inspectionRatings  — { inspectionId, itemId, condition, notes }, keyed by `${inspectionId}:${itemId}`
 *   photoQueue         — pending photo uploads (compressed JPEG blobs)
 *   savedInspections   — full room+item tree, auto-synced by syncEngine
 *   pendingWrites      — non-photo offline writes (ratings, notes) queued for server upload
 */

const DB_NAME = "pleks_offline"
const DB_VERSION = 3

let _db: IDBDatabase | null = null

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains("inspectionMeta")) {
        db.createObjectStore("inspectionMeta", { keyPath: "inspectionId" })
      }
      if (!db.objectStoreNames.contains("inspectionRatings")) {
        db.createObjectStore("inspectionRatings", { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains("photoQueue")) {
        db.createObjectStore("photoQueue", { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains("savedInspections")) {
        db.createObjectStore("savedInspections", { keyPath: "inspectionId" })
      }
      // v3: non-photo pending writes for sync engine
      if (!db.objectStoreNames.contains("pendingWrites")) {
        db.createObjectStore("pendingWrites", { keyPath: "id" })
      }
    }
    req.onsuccess = () => { _db = req.result; resolve(req.result) }
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

function idbPut(store: IDBObjectStore, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

// ── Item ratings ──────────────────────────────────────────────────────────────

export interface OfflineRating {
  key: string        // `${inspectionId}:${itemId}`
  inspectionId: string
  itemId: string
  condition: string
  notes: string
  savedAt: string
}

export async function saveItemRating(
  inspectionId: string,
  itemId: string,
  condition: string,
  notes: string,
): Promise<void> {
  const db = await openDB()
  const tx = db.transaction("inspectionRatings", "readwrite")
  await idbPut(tx.objectStore("inspectionRatings"), {
    key: `${inspectionId}:${itemId}`,
    inspectionId,
    itemId,
    condition,
    notes,
    savedAt: new Date().toISOString(),
  })
}

export async function getItemRating(
  inspectionId: string,
  itemId: string,
): Promise<OfflineRating | undefined> {
  const db = await openDB()
  const tx = db.transaction("inspectionRatings", "readonly")
  return idbGet<OfflineRating>(tx.objectStore("inspectionRatings"), `${inspectionId}:${itemId}`)
}

export async function getAllRatings(inspectionId: string): Promise<OfflineRating[]> {
  const db = await openDB()
  const tx = db.transaction("inspectionRatings", "readonly")
  const store = tx.objectStore("inspectionRatings")
  return new Promise((resolve, reject) => {
    const results: OfflineRating[] = []
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) { resolve(results); return }
      const record = cursor.value as OfflineRating
      if (record.inspectionId === inspectionId) results.push(record)
      cursor.continue()
    }
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

// ── Photo queue ───────────────────────────────────────────────────────────────

export interface PendingPhoto {
  id: string
  uploadUrl: string
  blob: Blob              // compressed JPEG working copy, ~300KB
  thumbnail: Blob         // 400×300 preview, ~30KB
  filename: string        // always ends in .jpg after client compression
  inspectionId: string
  roomId?: string
  itemId?: string
  gpsLat: number | null
  gpsLng: number | null
  capturedAt: string      // ISO timestamp from EXIF or file.lastModified
  originalSizeBytes: number
  queuedAt: string
}

export async function queuePhoto(photo: Omit<PendingPhoto, "queuedAt">): Promise<void> {
  const db = await openDB()
  const tx = db.transaction("photoQueue", "readwrite")
  await idbPut(tx.objectStore("photoQueue"), {
    ...photo,
    queuedAt: new Date().toISOString(),
  })
}

export async function getPendingPhotos(inspectionId: string): Promise<PendingPhoto[]> {
  const db = await openDB()
  const tx = db.transaction("photoQueue", "readonly")
  const store = tx.objectStore("photoQueue")
  return new Promise((resolve, reject) => {
    const results: PendingPhoto[] = []
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) { resolve(results); return }
      const record = cursor.value as PendingPhoto
      if (record.inspectionId === inspectionId) results.push(record)
      cursor.continue()
    }
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

/** Returns all pending photos across every inspection. */
export async function getAllPendingPhotos(): Promise<PendingPhoto[]> {
  const db = await openDB()
  const tx = db.transaction("photoQueue", "readonly")
  return new Promise((resolve, reject) => {
    const req = tx.objectStore("photoQueue").getAll()
    req.onsuccess = () => resolve(req.result as PendingPhoto[])
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

export async function removePendingPhoto(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction("photoQueue", "readwrite")
  return new Promise((resolve, reject) => {
    const req = tx.objectStore("photoQueue").delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

// ── Saved inspections (auto-synced by syncEngine) ────────────────────────────

export interface SavedInspectionItem {
  id: string
  item_name: string
  item_category: string | null
  condition: string | null
  condition_notes: string | null
}

export interface SavedInspectionRoom {
  id: string
  room_type: string
  room_label: string
  display_order: number
  items: SavedInspectionItem[]
}

export interface SavedInspection {
  inspectionId: string
  inspectionType: string
  status: string
  unitNumber: string
  propertyName: string
  tenantName: string | null
  tenantPhone: string | null
  scheduledDate: string | null
  rooms: SavedInspectionRoom[]
  savedAt: string
}

export async function saveInspectionData(data: Omit<SavedInspection, "savedAt">): Promise<void> {
  const db = await openDB()
  const tx = db.transaction("savedInspections", "readwrite")
  await idbPut(tx.objectStore("savedInspections"), {
    ...data,
    savedAt: new Date().toISOString(),
  })
}

export async function loadInspectionData(inspectionId: string): Promise<SavedInspection | undefined> {
  const db = await openDB()
  const tx = db.transaction("savedInspections", "readonly")
  return idbGet<SavedInspection>(tx.objectStore("savedInspections"), inspectionId)
}

export async function listSavedInspectionIds(): Promise<string[]> {
  const db = await openDB()
  const tx = db.transaction("savedInspections", "readonly")
  return new Promise((resolve, reject) => {
    const req = tx.objectStore("savedInspections").getAllKeys()
    req.onsuccess = () => resolve(req.result as string[])
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

export async function deleteSavedInspection(inspectionId: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction("savedInspections", "readwrite")
  return new Promise((resolve, reject) => {
    const req = tx.objectStore("savedInspections").delete(inspectionId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}
