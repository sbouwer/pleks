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
import { isSubPerson, COMPANY_FUNCTION_LABEL } from "@/lib/contacts/contactScope"

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
  // 25A §9: a person under a company. Sub-people are cached so their names MATCH in search, but they
  // never appear as standalone results — a match resolves to the parent org (organisationContactId).
  organisationContactId: string | null
  companyFunction: string | null
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
      .select("id, primary_role, first_name, last_name, company_name, primary_email, primary_phone, organisation_contact_id, company_function")
      .limit(FETCH_LIMIT),
    supabase
      .from("properties")
      .select("id, name, address_line1, suburb, city")
      .is("deleted_at", null)
      .limit(FETCH_LIMIT),
  ])

  if (contactsRes.error) { console.error("cacheReferenceData contacts:", contactsRes.error.message); return null }
  if (propertiesRes.error) { console.error("cacheReferenceData properties:", propertiesRes.error.message); return null }

  // Cache ALL contacts — including company sub-people — so their names match in search; the search
  // resolves a sub-person hit to its parent org. Counts/lists only ever surface top-level contacts.
  const contacts: RefContact[] = (contactsRes.data ?? []).map((c) => ({
    id: c.id as string,
    role: (c.primary_role as string) ?? "other",
    name: contactName(c.first_name as string | null, c.last_name as string | null, c.company_name as string | null),
    company: (c.company_name as string | null) ?? null,
    phone: (c.primary_phone as string | null) ?? null,
    email: (c.primary_email as string | null) ?? null,
    organisationContactId: (c.organisation_contact_id as string | null) ?? null,
    companyFunction: (c.company_function as string | null) ?? null,
  }))

  const properties: RefProperty[] = (propertiesRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "Property",
    address: [p.address_line1, p.suburb, p.city].filter(Boolean).join(", "),
  }))

  const topLevelCount = contacts.filter((c) => !isSubPerson({ organisation_contact_id: c.organisationContactId })).length
  const now = Date.now()

  const db = await openRefDB()
  const tx = db.transaction(["contacts", "properties", "meta"], "readwrite")
  const cStore = tx.objectStore("contacts")
  const pStore = tx.objectStore("properties")
  cStore.clear()
  pStore.clear()
  for (const c of contacts) cStore.put(c)
  for (const p of properties) pStore.put(p)
  // Counts reflect TOP-LEVEL contacts only (sub-people aren't standalone list entries).
  tx.objectStore("meta").put({ key: "counts", value: { contacts: topLevelCount, properties: properties.length, lastSynced: now } })
  await txDone(tx)

  return { contacts: topLevelCount, properties: properties.length, lastSynced: now }
}

// ── Reads (offline-safe) ─────────────────────────────────────────────────────────

export async function getReferenceCounts(): Promise<ReferenceCounts> {
  if (typeof indexedDB === "undefined") return { contacts: 0, properties: 0, lastSynced: null }
  try {
    const db = await openRefDB()
    const counts = await new Promise<ReferenceCounts>((resolve) => {
      const req = db.transaction("meta", "readonly").objectStore("meta").get("counts")
      req.onsuccess = () => resolve((req.result?.value as ReferenceCounts | undefined) ?? { contacts: 0, properties: 0, lastSynced: null })
      req.onerror = () => resolve({ contacts: 0, properties: 0, lastSynced: null })
    })
    return counts
  } catch {
    return { contacts: 0, properties: 0, lastSynced: null }
  }
}

function contactMatches(c: RefContact, q: string): boolean {
  return (
    c.name.toLowerCase().includes(q) ||
    (c.company ?? "").toLowerCase().includes(q) ||
    (c.phone ?? "").toLowerCase().includes(q) ||
    (c.email ?? "").toLowerCase().includes(q)
  )
}

function topLevelResult(c: RefContact): RefSearchResult {
  return {
    type: "contact",
    id: c.id,
    label: c.name,
    subtitle: [c.role.charAt(0).toUpperCase() + c.role.slice(1), c.phone].filter(Boolean).join(" · "),
    phone: c.phone,
    email: c.email,
    href: ROLE_HREF[c.role] ?? "/tenants",
  }
}

/**
 * Local fuzzy search over cached contacts + properties — works with no connection. A company sub-person
 * may MATCH by name/phone/email, but resolves to its parent org (25A §9): the result is the org, hinting
 * which person matched, and exposes that person's phone/email for tap-to-call (the person you searched).
 */
export async function searchReference(query: string): Promise<RefSearchResult[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2 || typeof indexedDB === "undefined") return []

  const [contacts, properties] = await Promise.all([
    getAll<RefContact>("contacts"),
    getAll<RefProperty>("properties"),
  ])

  const byId = new Map<string, RefContact>(contacts.map((c) => [c.id, c]))
  const results = new Map<string, RefSearchResult>()

  // Top-level matches first so a direct org hit wins over a resolved one.
  for (const c of contacts) {
    if (c.organisationContactId || !contactMatches(c, q)) continue
    results.set(c.id, topLevelResult(c))
  }
  // Sub-person matches resolve to the parent org (deduped; skip if the org already matched directly).
  for (const c of contacts) {
    if (!c.organisationContactId || !contactMatches(c, q)) continue
    const org = byId.get(c.organisationContactId)
    if (!org || results.has(org.id)) continue
    const fn = c.companyFunction ? COMPANY_FUNCTION_LABEL[c.companyFunction] ?? "Contact" : null
    const fnSuffix = fn ? ` · ${fn}` : ""
    results.set(org.id, {
      type: "contact",
      id: org.id,
      label: org.name,
      subtitle: `Matched ${c.name}${fnSuffix}`,
      phone: c.phone ?? org.phone,
      email: c.email ?? org.email,
      href: ROLE_HREF[org.role] ?? "/tenants",
    })
  }

  const contactHits = [...results.values()].slice(0, 20)

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
