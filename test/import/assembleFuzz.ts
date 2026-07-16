/**
 * test/import/assembleFuzz.ts — the multi-table assembler under fuzz (ADDENDUM_21C Phase 3)
 *
 * Notes:  The single-book fuzz (fuzz.ts) proved the row PATH; it is structurally blind to the multi-file MODEL —
 *         a synthetic single book cannot show that joins across files can go wrong. This tier generates a LINKED
 *         report SET (leases · contacts · property · deposit · a junction) with valid keys, then corrupts the
 *         JOINS — orphan REFERENCE, dangling FK, duplicate LEA, prefix/namespace collision, unnormalised key,
 *         an ambiguous name+phone — and asserts, on every case, the two things that matter:
 *
 *           NEVER-MIS-JOIN     no emitted lease ever carries a tenant other than the one the data links to it.
 *                              The catastrophic, near-irreversible error (D-3). This is the invariant.
 *           RESOLVE-OR-HOLD    every lease→party edge and every satellite REFERENCE either resolves or is HELD
 *                              and named; nothing silently vanishes (D-4: resolved + held = total).
 *
 *         Ground truth is carried per lease so a mis-join is DETECTABLE, not merely improbable. Seeded throughout
 *         (mulberry32) — a failure at seed 41 replays forever.
 */
import { rng, makeSAId } from "./book"
import { normaliseRef } from "@/lib/import/assemble/normalise"
import type { AssembledBook, StagedEntityKind, StagedTable } from "@/lib/import/assemble/types"

export type JoinCorruption =
  | "none"
  | "orphan_ref" // a deposit row for a LEA that does not exist — must be reported, never silently dropped
  | "dangling_fk" // the junction points a lease at a TEN that is not in contacts
  | "duplicate_lea" // two lease rows share one LEA key
  | "namespace_collision" // a TEN and a LEA share a number — the bare-REFERENCE trap
  | "unnormalised_key" // the junction spells a LEA with leading zeros / whitespace stripped
  | "ambiguous_name_phone" // no junction; two contacts share the party's name+phone (fuzzy ambiguity)

export const ALL_JOIN_CORRUPTIONS: JoinCorruption[] = [
  "none", "orphan_ref", "dangling_fk", "duplicate_lea", "namespace_collision", "unnormalised_key", "ambiguous_name_phone",
]

export interface ReportSet {
  tables: StagedTable[]
  /** Per lease (keyed by its unique property name): the tenant the data links to it, so a mis-join is catchable. */
  groundTruth: Map<string, { tenantId: string; tenantRef: string }>
}

function table(kind: StagedEntityKind, headers: string[], rows: Record<string, string>[]): StagedTable {
  return { name: kind, headers, rows, kind, keyColumn: headers.includes("REFERENCE") ? "REFERENCE" : undefined }
}

const pad = (n: number) => String(n).padStart(6, "0")

/** A correct, fully-linked report set of `n` leases (each its own property, tenant, landlord) + a junction. */
export function generateReportSet(seed: number, n = 8): ReportSet {
  const r = rng(seed)
  const leases: Record<string, string>[] = []
  const properties: Record<string, string>[] = []
  const deposits: Record<string, string>[] = []
  const contacts: Record<string, string>[] = []
  const junction: Record<string, string>[] = []
  const groundTruth = new Map<string, { tenantId: string; tenantRef: string }>()

  for (let i = 1; i <= n; i++) {
    const lea = `LEA${pad(i)}`, ten = `TEN${pad(i)}`, onr = `ONR${pad(i)}`, pro = `PRO${pad(i)}`
    const propName = `Prop ${i}`
    const tenantId = makeSAId(r)
    const phone = `08${String(Math.floor(r() * 1e7)).padStart(8, "0")}`
    leases.push({ REFERENCE: lea, "PROPERTY NAME": propName, "START DATE": "2024/01/01", "END DATE": "2026/12/31", "RENTAL AMOUNT": String(5000 + i) })
    properties.push({ REFERENCE: pro, PROPERTY: propName, STATE: "Active" })
    deposits.push({ REFERENCE: lea, HELD: String((5000 + i) * 2) })
    contacts.push({ REFERENCE: ten, TYPE: "tenant", "FIRST NAMES": `Tenant${i}`, SURNAME: `Sur${i}`, IDENTIFIER: tenantId, EMAIL: `ten${i}@x.co.za`, NUMBERS: phone })
    contacts.push({ REFERENCE: onr, TYPE: "landlord", "FIRST NAMES": `Owner${i}`, SURNAME: `Own${i}`, IDENTIFIER: "", EMAIL: `onr${i}@x.co.za`, NUMBERS: `07${String(Math.floor(r() * 1e7)).padStart(8, "0")}` })
    junction.push({ REFERENCE: lea, TENANTS: ten, LANDLORD: onr })
    groundTruth.set(propName, { tenantId, tenantRef: ten })
  }
  // a couple of standalone contacts (on no lease) that must still import
  contacts.push({ REFERENCE: "SUP000001", TYPE: "vendor", "FIRST NAMES": "", SURNAME: "", IDENTIFIER: "", EMAIL: "sup@x.co.za", NUMBERS: "0110000000" })

  const tables = [
    table("lease", ["REFERENCE", "PROPERTY NAME", "START DATE", "END DATE", "RENTAL AMOUNT"], leases),
    table("property", ["REFERENCE", "PROPERTY", "STATE"], properties),
    table("deposit", ["REFERENCE", "HELD"], deposits),
    table("contact", ["REFERENCE", "TYPE", "FIRST NAMES", "SURNAME", "IDENTIFIER", "EMAIL", "NUMBERS"], contacts),
    table("lease_parties", ["REFERENCE", "TENANTS", "LANDLORD"], junction),
  ]
  return { tables, groundTruth }
}

const findTable = (set: ReportSet, kind: StagedEntityKind) => set.tables.find((t) => t.kind === kind)!

/** Apply ONE join-targeting corruption to a fresh copy of the set. */
export function corruptJoins(base: ReportSet, c: JoinCorruption, seed: number): ReportSet {
  const set: ReportSet = {
    tables: base.tables.map((t) => ({ ...t, rows: t.rows.map((row) => ({ ...row })) })),
    groundTruth: new Map(base.groundTruth),
  }
  const r = rng(seed ^ 0x9e3779b9)
  const parties = findTable(set, "lease_parties")
  const contacts = findTable(set, "contact")

  switch (c) {
    case "none":
      break
    case "orphan_ref":
      findTable(set, "deposit").rows.push({ REFERENCE: "LEA999999", HELD: "9999" })
      break
    case "dangling_fk":
      parties.rows[0]!.TENANTS = "TEN999999" // points at a tenant that is not in contacts
      break
    case "duplicate_lea": {
      const dup = { ...findTable(set, "lease").rows[0]! }
      findTable(set, "lease").rows.push(dup)
      break
    }
    case "namespace_collision":
      // TENnnnnnn and LEAnnnnnn already share the number n by construction — assert the junction's TEN ref never
      // grabs the same-numbered LEA. Reinforce by also pointing a landlord slot at a same-numbered PRO code.
      parties.rows[0]!.LANDLORD = parties.rows[0]!.LANDLORD!.replace("ONR", "PRO")
      break
    case "unnormalised_key": {
      // Spell the first junction's LEA with leading zeros stripped + surrounding whitespace.
      const raw = parties.rows[0]!.REFERENCE!
      parties.rows[0]!.REFERENCE = `  ${raw.replace(/(?<=LEA)0+/, "")} `
      break
    }
    case "ambiguous_name_phone": {
      // Drop to the fuzzy path: rewrite the junction to a NAME string, and give TWO contacts the same name+phone.
      const t0 = contacts.rows.find((row) => row.REFERENCE === "TEN000001")!
      const clone = { ...t0, REFERENCE: "TEN000009", IDENTIFIER: makeSAId(r), EMAIL: "clone@x.co.za" } // same name+phone
      contacts.rows.push(clone)
      parties.rows[0]!.TENANTS = `${t0["FIRST NAMES"]} ${t0.SURNAME} (${t0.NUMBERS})`
      break
    }
  }
  return set
}

export interface AssembleViolation { kind: string; detail: string }

/**
 * The invariants, on every case. `book` is what `assemble` produced for the (possibly corrupted) `set`.
 * NEVER-MIS-JOIN is the one that matters; the rest guard report-honesty.
 */
export function checkAssembleInvariants(set: ReportSet, book: AssembledBook): AssembleViolation[] {
  const v: AssembleViolation[] = []

  // NEVER-MIS-JOIN: every emitted lease carries the tenant the ground truth links to its property.
  for (const row of book.rows) {
    if (row.__entity_type !== "") continue
    const truth = set.groundTruth.get(row.property_name ?? "")
    if (truth && row.id_number && row.id_number !== truth.tenantId) {
      v.push({ kind: "MIS-JOIN", detail: `${row.property_name}: tenant id ${row.id_number} != linked ${truth.tenantId}` })
    }
  }

  // REPORT-HONESTY: resolved + held = total, and nothing is negative.
  const { resolved, held, total } = book.ledger
  if (resolved + held !== total) v.push({ kind: "LEDGER", detail: `resolved ${resolved} + held ${held} != total ${total}` })
  if (resolved < 0 || held < 0) v.push({ kind: "LEDGER", detail: "negative count" })

  // NO-SILENT-ORPHAN (D-4): every satellite REFERENCE (deposit / parties) either matches a lease or is HELD.
  const leaseTable = set.tables.find((t) => t.kind === "lease")!
  const leaseRefs = new Set(leaseTable.rows.map((r) => normaliseRef(r[leaseTable.keyColumn!] ?? "")))
  const holdSubjects = new Set(book.ledger.holds.map((h) => normaliseRef(h.subject)))
  for (const kind of ["deposit", "lease_parties"] as const) {
    const t = set.tables.find((x) => x.kind === kind)
    for (const row of t?.rows ?? []) {
      const nr = normaliseRef(row[t!.keyColumn!] ?? "")
      if (nr && !leaseRefs.has(nr) && !holdSubjects.has(nr)) {
        v.push({ kind: "SILENT-ORPHAN", detail: `${kind} ref ${nr} matches no lease and no hold` })
      }
    }
  }

  // NO-DUPLICATE-EMIT: a duplicated LEA must never produce two silent lease rows (one property, one lease).
  const emittedProps = book.rows.filter((r) => r.__entity_type === "").map((r) => r.property_name)
  if (new Set(emittedProps).size !== emittedProps.length) {
    v.push({ kind: "DUP-EMIT", detail: `duplicate property emitted: ${emittedProps.join(",")}` })
  }

  return v
}
