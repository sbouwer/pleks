/**
 * lib/import/assemble/assemble.ts — join a relational report SET into the importer's per-lease book (ADDENDUM_21C)
 *
 * Notes:  The orchestrator (D-1 pre-stage). It resolves the lease SPINE deterministically (lease → property by
 *         name, → deposit by LEA key), resolves lease→party by the junction report if present (deterministic, D-2)
 *         or the fuzzy fallback if not (D-7 — always HELD, never guessed), and emits the denormalised rows the
 *         hardened importer already eats plus the held/orphan ledger 21D renders (D-4: resolved + held = total).
 *         The importer, its guards and identity dedup are untouched.
 *
 *         SCOPE NOTE: the assembler emits `property_name` (+ address if the source carries it); a real MRI set has
 *         no property address, so the IMPORT of an address-less property depends on the migration-completeness
 *         relax (a separate, CD-spec'd build — see CURRENT.md). This pure stage and its test assert the ASSEMBLED
 *         book (rows + ledger); the money-unit + address round-trip through `runImport` is a later dbtest.
 */
import type { ColumnMapping } from "@/lib/import/importRunner"
import type { AssembledBook, Hold, HeldLedger, StagedEntityKind, StagedTable } from "./types"
import { normaliseRef, refPrefix, normalizePhone } from "./normalise"
import { resolvePartyByJunction, resolvePartyFuzzy, type StagedContact } from "./resolveParties"

/** A contact from the ContactsExport table, with its role (from its REFERENCE prefix) + its full row. */
interface IndexedContact extends StagedContact {
  role: "tenant" | "landlord" | "vendor" | "agent" | "other"
  row: Record<string, string>
}

const cell = (row: Record<string, string>, ...names: string[]): string => {
  for (const n of names) {
    const hit = Object.keys(row).find((k) => k.trim().toLowerCase() === n.toLowerCase())
    if (hit && row[hit]?.trim()) return row[hit]!.trim()
  }
  return ""
}

const ROLE_BY_PREFIX: Record<string, IndexedContact["role"]> = {
  TEN: "tenant", ONR: "landlord", SUP: "vendor", AGT: "agent",
}
const ENTITY_TYPE_BY_ROLE: Record<IndexedContact["role"], string> = {
  tenant: "tenant", landlord: "landlord", vendor: "vendor", agent: "agent", other: "",
}

function indexContacts(table: StagedTable | undefined): Map<string, IndexedContact> {
  const byRef = new Map<string, IndexedContact>()
  if (!table) return byRef
  const keyCol = table.keyColumn ?? "REFERENCE"
  for (const row of table.rows) {
    const ref = cell(row, keyCol)
    if (!ref) continue
    const role = ROLE_BY_PREFIX[refPrefix(ref)] ?? "other"
    byRef.set(normaliseRef(ref), {
      ref,
      role,
      name: cell(row, "LEGAL NAME", "TRADING NAME") || [cell(row, "FIRST NAMES", "FIRST NAME"), cell(row, "SURNAME", "LAST NAME")].filter(Boolean).join(" "),
      phone: normalizePhone(cell(row, "NUMBERS", "CELL", "PHONE")),
      email: cell(row, "EMAIL") || null,
      row,
    })
  }
  return byRef
}

/** Denormalise a resolved contact's identity onto a lease row (tenant path) or as the property owner (landlord). */
function denormalise(target: Record<string, string>, c: IndexedContact, as: "tenant" | "landlord"): void {
  const first = cell(c.row, "FIRST NAMES", "FIRST NAME")
  const last = cell(c.row, "SURNAME", "LAST NAME")
  const company = cell(c.row, "LEGAL NAME", "TRADING NAME")
  if (as === "tenant") {
    target.first_name = first
    target.last_name = last
    target.company_name = company
    target.email = c.email ?? ""
    target.phone = c.phone ?? ""
    target.id_number = cell(c.row, "IDENTIFIER", "ID NUMBER")
    target.vat_number = cell(c.row, "VAT NUMBER")
  } else {
    target.owner_name = company || [first, last].filter(Boolean).join(" ")
    target.owner_email = c.email ?? ""
    target.owner_phone = c.phone ?? ""
  }
}

function standaloneRow(c: IndexedContact): Record<string, string> {
  const row: Record<string, string> = { __entity_type: ENTITY_TYPE_BY_ROLE[c.role] }
  denormalise(row, c, "tenant") // identity columns are the same shape; __entity_type routes it
  return row
}

/** Resolve one lease→party edge: junction (the party value is a TEN/ONR ref) → deterministic; else → fuzzy. */
function resolveEdge(
  leaseRef: string,
  partyValue: string,
  role: "tenant" | "landlord",
  contactsByRef: Map<string, IndexedContact>,
  pool: IndexedContact[],
) {
  const wantPrefix = role === "tenant" ? "TEN" : "ONR"
  if (refPrefix(partyValue) === wantPrefix) {
    return resolvePartyByJunction(leaseRef, partyValue, contactsByRef, role)
  }
  return resolvePartyFuzzy(leaseRef, partyValue, role, pool)
}

/** MRI money is rands; the importer's `_cents` field is cents — convert or the lease is 100× wrong (F-8). */
function randsToCents(raw: string): string {
  const n = Number(raw.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? String(Math.round(n * 100)) : ""
}

/** The shared indices one pass over the report set builds; every lease is resolved against these. */
interface AssembleCtx {
  contactsByRef: Map<string, IndexedContact>
  tenantPool: IndexedContact[]
  landlordPool: IndexedContact[]
  depositByLea: Map<string, string>
  partiesByLea: Map<string, Record<string, string>>
}

interface EdgeOutcome { holds: Hold[]; resolved: number; held: number; used: string[]; denormalised: boolean }

/** Resolve one lease→party edge and, if resolved, denormalise the contact onto the row. Never guesses (D-3). */
function resolveEdgeInto(row: Record<string, string>, leaseRef: string, value: string, role: "tenant" | "landlord", ctx: AssembleCtx): EdgeOutcome {
  const pool = role === "tenant" ? ctx.tenantPool : ctx.landlordPool
  const res = resolveEdge(leaseRef, value, role, ctx.contactsByRef, pool)
  if (res.status === "resolved") {
    denormalise(row, ctx.contactsByRef.get(normaliseRef(res.ref))!, role)
    return { holds: [], resolved: 1, held: 0, used: [normaliseRef(res.ref)], denormalised: true }
  }
  return { holds: [res.hold], resolved: 0, held: 1, used: [], denormalised: false }
}

const noLinkageHold = (leaseRef: string, role: string): Hold => ({
  kind: "reference", subject: leaseRef,
  reason: `Lease ${leaseRef} has no ${role} linkage in any uploaded report — upload the lease-detail report that links leases to contacts by ID, or the ${role} list.`,
  decisions: ["upload_table", "accept_as_held", "exclude"],
})

interface LeaseOutcome { row: Record<string, string> | null; holds: Hold[]; resolved: number; held: number; used: string[] }

/** Assemble ONE lease: spine + deposit, then its tenant + landlord edges. Emits a row only if the tenant resolved. */
function processLease(leaseRow: Record<string, string>, keyColumn: string, ctx: AssembleCtx): LeaseOutcome {
  const leaseRef = cell(leaseRow, keyColumn)
  const empty: LeaseOutcome = { row: null, holds: [], resolved: 0, held: 0, used: [] }
  if (!leaseRef) return empty

  const row: Record<string, string> = { __entity_type: "" }
  row.property_name = cell(leaseRow, "PROPERTY NAME", "PROPERTY")
  row.lease_start = cell(leaseRow, "START DATE")
  row.lease_end = cell(leaseRow, "END DATE")
  row.rent_amount_cents = randsToCents(cell(leaseRow, "RENTAL AMOUNT", "RENTAL"))
  const dep = ctx.depositByLea.get(normaliseRef(leaseRef))
  if (dep) row.deposit_amount_cents = randsToCents(dep)

  const party = ctx.partiesByLea.get(normaliseRef(leaseRef))
  const holds: Hold[] = []
  const used: string[] = []
  let resolved = 0
  let held = 0
  let tenantOk = false

  const tenantValue = party ? cell(party, "TENANTS", "TENANT") : ""
  if (tenantValue) {
    const o = resolveEdgeInto(row, leaseRef, tenantValue, "tenant", ctx)
    holds.push(...o.holds); resolved += o.resolved; held += o.held; used.push(...o.used); tenantOk = o.denormalised
  } else {
    holds.push(noLinkageHold(leaseRef, "tenant")); held++
  }

  const landlordValue = party ? cell(party, "LANDLORD", "OWNER") : ""
  if (landlordValue) {
    const o = resolveEdgeInto(row, leaseRef, landlordValue, "landlord", ctx)
    holds.push(...o.holds); resolved += o.resolved; held += o.held; used.push(...o.used)
  }

  // Only a lease with a resolved tenant can import (D-3: never a lease with a guessed/blank lessee).
  return { row: tenantOk ? row : null, holds, resolved, held, used }
}

function indexByLea(table: StagedTable | undefined, ...valueCols: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of table?.rows ?? []) {
    const ref = cell(row, table!.keyColumn ?? "REFERENCE")
    if (ref) map.set(normaliseRef(ref), cell(row, ...valueCols))
  }
  return map
}

export function assemble(tables: StagedTable[]): AssembledBook {
  const first = (k: StagedEntityKind) => tables.find((t) => t.kind === k)
  const leaseTable = first("lease")
  const contactsByRef = indexContacts(first("contact"))

  // Manifest (D-2) — the presence half of 21D's completion.
  const missingRequired = (["lease", "contact", "property"] as const).filter((k) => !first(k))

  const partiesByLea = new Map<string, Record<string, string>>()
  for (const row of first("lease_parties")?.rows ?? []) {
    const ref = cell(row, first("lease_parties")!.keyColumn ?? "REFERENCE")
    if (ref) partiesByLea.set(normaliseRef(ref), row)
  }
  const ctx: AssembleCtx = {
    contactsByRef,
    tenantPool: [...contactsByRef.values()].filter((c) => c.role === "tenant"),
    landlordPool: [...contactsByRef.values()].filter((c) => c.role === "landlord"),
    depositByLea: indexByLea(first("deposit"), "HELD", "TOTAL HELD", "REQUIRED"),
    partiesByLea,
  }

  const rows: Record<string, string>[] = []
  const holds: Hold[] = []
  let resolved = 0
  let held = 0
  const usedContacts = new Set<string>()

  for (const leaseRow of leaseTable?.rows ?? []) {
    const out = processLease(leaseRow, leaseTable!.keyColumn ?? "REFERENCE", ctx)
    holds.push(...out.holds)
    resolved += out.resolved
    held += out.held
    out.used.forEach((u) => usedContacts.add(u))
    if (out.row) rows.push(out.row)
  }

  // Every contact not already denormalised onto an emitted lease imports standalone, so no identity is lost.
  for (const [key, c] of contactsByRef) {
    if (!usedContacts.has(key)) rows.push(standaloneRow(c))
  }

  const mapping: ColumnMapping = Object.fromEntries(
    [...new Set(rows.flatMap((r) => Object.keys(r)))].map((f) => [f, { column: f, field: f, entity: "" }]),
  )
  const ledger: HeldLedger = { holds, resolved, held, total: resolved + held, missingRequired: [...missingRequired] }
  return { rows, mapping, ledger }
}
