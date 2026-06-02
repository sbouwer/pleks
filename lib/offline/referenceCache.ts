/**
 * lib/offline/referenceCache.ts — lightweight offline read-cache for reference data
 *
 * Auth:   browser client — RLS scopes rows to the agent's org
 * Data:   contacts (people to call/email) + properties (addresses), cached in IndexedDB for field lookup
 * Notes:  Separate DB (pleks_reference) from the inspection offline store so the critical capture path is
 *         never version-bumped by reference work. Only PLAINTEXT display fields are cached — never the
 *         encrypted id_number, bank details, or any masked PII. Read-only mirror; the server stays SSOT.
 */

import { createClient } from "@/lib/supabase/client"
import { isOnline } from "@/lib/offline/syncManager"

const DB_NAME = "pleks_reference"
const DB_VERSION = 1
const FETCH_LIMIT = 3000

export interface RefContact {
  id: string
  role: string
  name: string
  company: string | null
  phone: string | null
  email: string | null
}

export interface RefProperty {
  id: string
  name: string
  address: string
}

export interface ReferenceCounts {
  contacts: number
  properties: number
  lastSynced: number | null
}

export interface RefSearchResult {
  type: "contact" | "property"
  id: string
  label: string
  subtitle: string
  phone: string | null
  email: string | null
  href: string
}

let _db: IDBDatabase | null = null

function openRefDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains("contacts")) db.createObjectStore("contacts", { keyPath: "id" })
      if (!db.objectStoreNames.contains("properties")) db.createObjectStore("properties", { keyPath: "id" })
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" })
    }
    req.onsuccess = () => { _db = req.result; resolve(req.result) }
    req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new Error(tx.error?.message ?? "IDB tx error"))
    tx.onabort = () => reject(new Error(tx.error?.message ?? "IDB tx aborted"))
  })
}

function getAll<T>(store: string): Promise<T[]> {
  return openRefDB().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const req = db.transaction(store, "readonly").objectStore(store).getAll()
        req.onsuccess = () => resolve((req.result ?? []) as T[])
        req.onerror = () => reject(new Error(req.error?.message ?? "IDB error"))
      }),
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function contactName(first: string | null, last: string | null, company: string | null): string {
  const person = [first, last].filter(Boolean).join(" ").trim()
  return person || company || "Contact"
}

const ROLE_HREF: Record<string, string> = {
  tenant: "/tenants",
  landlord: "/landlords",
  contractor: "/suppliers",
  supplier: "/suppliers",
}

// ── Cache refresh (online → IndexedDB) ───────────────────────────────────────────

/**
 * Fetch the reference projections and replace the cache. No-op when offline. Returns the new counts.
 * Only plaintext display fields are stored — the encrypted id_number is never selected.
 */
export async function cacheReferenceData(): Promise<ReferenceCounts | null> {
  if (typeof indexedDB === "undefined" || !isOnline()) return null
  const supabase = createClient()

  const [contactsRes, propertiesRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, primary_role, first_name, last_name, company_name, primary_email, primary_phone")
      .limit(FETCH_LIMIT),
    supabase
      .from("properties")
      .select("id, name, address_line1, suburb, city")
      .is("deleted_at", null)
      .limit(FETCH_LIMIT),
  ])

  if (contactsRes.error) { console.error("cacheReferenceData contacts:", contactsRes.error.message); return null }
  if (propertiesRes.error) { console.error("cacheReferenceData properties:", propertiesRes.error.message); return null }

  const contacts: RefContact[] = (contactsRes.data ?? []).map((c) => ({
    id: c.id as string,
    role: (c.primary_role as string) ?? "other",
    name: contactName(c.first_name as string | null, c.last_name as string | null, c.company_name as string | null),
    company: (c.company_name as string | null) ?? null,
    phone: (c.primary_phone as string | null) ?? null,
    email: (c.primary_email as string | null) ?? null,
  }))

  const properties: RefProperty[] = (propertiesRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "Property",
    address: [p.address_line1, p.suburb, p.city].filter(Boolean).join(", "),
  }))

  const db = await openRefDB()
  const tx = db.transaction(["contacts", "properties", "meta"], "readwrite")
  const cStore = tx.objectStore("contacts")
  const pStore = tx.objectStore("properties")
  cStore.clear()
  pStore.clear()
  for (const c of contacts) cStore.put(c)
  for (const p of properties) pStore.put(p)
  const now = Date.now()
  tx.objectStore("meta").put({ key: "lastSynced", value: now })
  await txDone(tx)

  return { contacts: contacts.length, properties: properties.length, lastSynced: now }
}

// ── Reads (offline-safe) ─────────────────────────────────────────────────────────

export async function getReferenceCounts(): Promise<ReferenceCounts> {
  if (typeof indexedDB === "undefined") return { contacts: 0, properties: 0, lastSynced: null }
  try {
    const db = await openRefDB()
    const [contacts, properties] = await Promise.all([
      new Promise<number>((resolve) => {
        const req = db.transaction("contacts", "readonly").objectStore("contacts").count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(0)
      }),
      new Promise<number>((resolve) => {
        const req = db.transaction("properties", "readonly").objectStore("properties").count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(0)
      }),
    ])
    const meta = await new Promise<number | null>((resolve) => {
      const req = db.transaction("meta", "readonly").objectStore("meta").get("lastSynced")
      req.onsuccess = () => resolve((req.result?.value as number | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
    return { contacts, properties, lastSynced: meta }
  } catch {
    return { contacts: 0, properties: 0, lastSynced: null }
  }
}

/** Local fuzzy search over cached contacts + properties — works with no connection. */
export async function searchReference(query: string): Promise<RefSearchResult[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2 || typeof indexedDB === "undefined") return []

  const [contacts, properties] = await Promise.all([
    getAll<RefContact>("contacts"),
    getAll<RefProperty>("properties"),
  ])

  const contactHits: RefSearchResult[] = contacts
    .filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q),
    )
    .slice(0, 20)
    .map((c) => ({
      type: "contact" as const,
      id: c.id,
      label: c.name,
      subtitle: [c.role.charAt(0).toUpperCase() + c.role.slice(1), c.phone].filter(Boolean).join(" · "),
      phone: c.phone,
      email: c.email,
      href: ROLE_HREF[c.role] ?? "/tenants",
    }))

  const propertyHits: RefSearchResult[] = properties
    .filter((p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
    .slice(0, 20)
    .map((p) => ({
      type: "property" as const,
      id: p.id,
      label: p.name,
      subtitle: p.address || "Property",
      phone: null,
      email: null,
      href: `/properties/${p.id}`,
    }))

  return [...contactHits, ...propertyHits]
}
