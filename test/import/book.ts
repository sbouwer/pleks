/**
 * test/import/book.ts — the seeded book generator: GROUND TRUTH, produced before anything is rendered
 *
 * Notes:  Stress-testing an importer is not about throwing garbage at it. Random fuzzing finds crashes, and
 *         crashes are not our enemy — a crash is loud. Our doctrine is that a WRONG import is worse than
 *         "I cannot process this", which means the enemy is SILENT WRONGNESS, and you cannot detect silent
 *         wrongness unless you already know what should have happened to every byte you threw.
 *
 *         So the harness generates the TRUTH FIRST and corrupts it SECOND.
 *
 *         This module is the oracle. It emits an agency's book as structured data — properties, units,
 *         tenants (real Luhn-valid SA IDs, juristic entities), leases (fixed/month-to-month, residential/
 *         commercial, natural/juristic consumers, past/current/future end dates), landlords, suppliers,
 *         agents, deposits. Every downstream assertion compares the DATABASE against this object.
 *
 *         Seeded RNG throughout: a failure at seed 41 is replayable forever by passing 41. No wall-clock, no
 *         Math.random — the same seed produces a byte-identical book on any machine, on any day.
 *
 *         The sequencing win: a clean book at 100% benign, rendered in af-ZA, imported twice, IS the
 *         acceptance run. The founding-agent gate and the stress harness are one investment, not two.
 */
import { saTodayISO, addCalendarMonths } from "@/lib/dates"

// ── Seeded RNG. mulberry32: tiny, fast, and deterministic across platforms. ──────────────────────

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))

// ── South African vocabulary. Real names, real places — a book that LOOKS like a book. ───────────

const FIRST = ["Thabo", "Lerato", "Pieter", "Nomsa", "Johan", "Zanele", "Riaan", "Ayanda", "Sipho", "Marié",
  "Kagiso", "Willem", "Naledi", "Deon", "Precious", "Hendrik", "Lindiwe", "Francois"] as const
const LAST = ["Nkosi", "van der Merwe", "Dlamini", "Botha", "Mokoena", "Pretorius", "Khumalo", "Naidoo",
  "Jacobs", "Mahlangu", "du Plessis", "Ndlovu", "Cele", "Steyn"] as const
const JURISTIC = ["Ubuntu Holdings (Pty) Ltd", "Sandton Trading CC", "Kaya Properties (Pty) Ltd",
  "Mzansi Retail Group (Pty) Ltd", "Cape Ventures CC"] as const
const STREET = ["Long", "Bree", "Church", "Loop", "Kloof", "Rissik", "Jan Smuts", "Voortrekker", "Umgeni"] as const
const CITY = [["Cape Town", "WC"], ["Johannesburg", "GP"], ["Durban", "KZN"], ["Pretoria", "GP"],
  ["Gqeberha", "EC"], ["Bloemfontein", "FS"]] as const
const SUBURB = ["Rondebosch", "Sandton", "Umhlanga", "Hatfield", "Sea Point", "Melville"] as const
const BANK = ["FNB", "Standard Bank", "ABSA", "Nedbank", "Capitec"] as const
const TRADES = ["Plumbing", "Electrical", "Roofing", "Painting", "Landscaping"] as const

/**
 * A REAL SA ID number, checksum and all.
 *
 * The generator MUST produce valid ones, because "a valid ID" is the control against which the poison
 * harness's checksum-failure case is meaningful. A book seeded with junk IDs would make the ID validator
 * untestable — every row would flag, and a flag on every row is the same as a flag on none.
 *
 * Format: YYMMDD SSSS C A Z — Z is the Luhn check digit over the first twelve.
 */
export function makeSAId(r: () => number, opts?: { female?: boolean }): string {
  const yy = String(int(r, 60, 99)).padStart(2, "0")
  const mm = String(int(r, 1, 12)).padStart(2, "0")
  const dd = String(int(r, 1, 28)).padStart(2, "0")            // 28: never an invalid calendar day
  const seq = String(opts?.female ? int(r, 0, 4999) : int(r, 5000, 9999)).padStart(4, "0")
  const body = `${yy}${mm}${dd}${seq}` + "0" + "8"             // C=0 (SA citizen), A=8 (fixed)

  // Luhn over the 12 body digits; Z makes the 13 sum to a multiple of 10.
  let sum = 0
  for (const [i, ch] of [...body].entries()) {
    const d = Number(ch)
    if (i % 2 === 0) sum += d
    else {
      const dbl = d * 2
      sum += dbl > 9 ? dbl - 9 : dbl
    }
  }
  return body + String((10 - (sum % 10)) % 10)
}

// ── The ground truth. Field values are TYPED, not strings: the renderer decides how they LOOK. ───

export type EntityKind = "tenant" | "landlord" | "vendor" | "agent"

/** Every value in a row, in its true form. The renderer formats these; the reconciler asserts them. */
export interface GtRow {
  index: number
  entity: EntityKind

  // Identity (all entities)
  firstName?: string
  lastName?: string
  companyName?: string
  email: string
  phone: string
  idNumber?: string

  // Property / unit (tenant rows)
  propertyName?: string
  addressLine1?: string
  suburb?: string
  city?: string
  province?: string
  unitNumber?: string

  // Lease (tenant rows) — money is CENTS, the only honest unit
  rentCents?: number
  depositCents?: number
  leaseStart?: string          // ISO
  leaseEnd?: string | null     // ISO; null = month-to-month
  leaseType?: "residential" | "commercial"
  escalationType?: "fixed" | "cpi" | "none"
  escalationPercent?: number
  paymentDueDay?: number
  noticePeriodDays?: number
  depositReturnDays?: number
  isFixedTerm?: boolean
  cpaApplies?: boolean
  paymentReference?: string
  bankAccount?: string
  bankName?: string

  // Supplier (vendor rows)
  supplierType?: "contractor" | "managing_scheme" | "utility"
  registrationNumber?: string
  vatNumber?: string

  // Agent rows
  agentRole?: "property_manager" | "agent" | "owner"
}

export interface GroundTruth {
  seed: number
  rows: GtRow[]
  /** Money that MUST survive the round trip. Any ×100 anywhere shows up here instantly. */
  totalRentCents: number
  totalDepositCents: number
}

export interface BookSpec {
  seed: number
  leases?: number
  landlords?: number
  vendors?: number
  agents?: number
  /** Include the awkward-but-legal shapes: juristic tenants, month-to-month, commercial, expired. */
  variety?: boolean
}

/**
 * Generate a book. The values are chosen to be REAL, not convenient — and deliberately never to coincide
 * with a column's DB default, because a fixture that agrees with the default cannot see the default.
 * (The first ablation harness learned this the hard way: three real fall-throughs were invisible because
 * the control happened to equal the schema default.)
 */
const emailFor = (n: string, s: string, i: number) =>
  `${n}.${s}${i}`.toLowerCase().replaceAll(/[^a-z0-9.]/g, "") + "@example.co.za"

export function generateBook(spec: BookSpec): GroundTruth {
  const r = rng(spec.seed)
  const rows: GtRow[] = []

  // Order matters: tenant rows first, then the entity types the file may also carry. Each builder appends,
  // and the row INDEX is the file's own line number — which is what every ImportError reports back.
  addTenantRows(rows, r, spec)
  addLandlordRows(rows, r, spec)
  addVendorRows(rows, r, spec)
  addAgentRows(rows, r, spec)

  const tenants = rows.filter((x) => x.entity === "tenant")
  return {
    seed: spec.seed,
    rows,
    totalRentCents: tenants.reduce((s, x) => s + (x.rentCents ?? 0), 0),
    totalDepositCents: tenants.reduce((s, x) => s + (x.depositCents ?? 0), 0),
  }
}

/** Tenant + property + unit + lease — the row that carries almost every field the importer knows. */
function addTenantRows(rows: GtRow[], r: () => number, spec: BookSpec): void {
  const today = saTodayISO()
  const email = emailFor
  let index = rows.length

  for (let i = 0; i < (spec.leases ?? 5); i++) {
    const juristic = spec.variety === true && i % 5 === 4
    const commercial = spec.variety === true && i % 4 === 3
    const monthToMonth = spec.variety === true && i % 3 === 2

    const first = pick(r, FIRST)
    const last = pick(r, LAST)
    const [city, province] = pick(r, CITY)

    // Rent carries CENTS that are not round (…50), so a truncating parser is caught, not flattered.
    const rentCents = int(r, 45, 250) * 100_00 + 50
    const depositCents = rentCents * int(r, 1, 2)
    const start = addCalendarMonths(today, -int(r, 2, 24))

    rows.push({
      index: index++,
      entity: "tenant",
      firstName: juristic ? undefined : first,
      lastName: juristic ? undefined : last,
      companyName: juristic ? pick(r, JURISTIC) : undefined,
      email: email(first, last, i),
      phone: `08${int(r, 2, 4)}${String(int(r, 1000000, 9999999))}`,
      idNumber: juristic ? undefined : makeSAId(r),

      propertyName: `${pick(r, SUBURB)} ${pick(r, ["Court", "Place", "Mews", "Heights"])}`,
      addressLine1: `${int(r, 1, 199)} ${pick(r, STREET)} Street`,
      suburb: pick(r, SUBURB),
      city, province,
      unitNumber: String(i + 1),

      rentCents,
      depositCents,
      leaseStart: start,
      leaseEnd: monthToMonth ? null : addCalendarMonths(start, 12),
      leaseType: commercial ? "commercial" : "residential",
      // Deliberately OFF the DB defaults: escalation_type default is 'fixed', escalation 10.00, due-day 1,
      // notice 20, deposit-return 30, is_fixed_term true. Every one of these differs.
      // "none" is a real lease term (rent that does not increase) and the generator emits it deliberately:
      // it is the case where the schema default (10.00) would otherwise invent an escalation nobody agreed to.
      ...(() => {
        const basis = pick(r, ["cpi", "none"] as const)
        return { escalationType: basis, escalationPercent: basis === "none" ? 0 : int(r, 5, 9) + 0.5 }
      })(),
      paymentDueDay: int(r, 2, 7),
      noticePeriodDays: pick(r, [30, 60] as const),
      depositReturnDays: pick(r, [7, 14, 21] as const),
      isFixedTerm: !monthToMonth,
      // CPA turns on the CONSUMER, not the premises (s5(2)) — a natural person letting a shop is still covered.
      cpaApplies: !juristic,
      paymentReference: `${last.toUpperCase().replaceAll(/[^A-Z]/g, "")}-${String(i + 1).padStart(3, "0")}`,
      bankAccount: String(int(r, 6000000000, 6299999999)),
      bankName: pick(r, BANK),
    })
  }

}

/** Landlord rows — an entity path that had NO test of any kind before the stress harness. */
function addLandlordRows(rows: GtRow[], r: () => number, spec: BookSpec): void {
  const email = emailFor
  let index = rows.length

  for (let i = 0; i < (spec.landlords ?? 0); i++) {
    const juristic = i % 3 === 2
    const first = pick(r, FIRST)
    const last = pick(r, LAST)
    rows.push({
      index: index++,
      entity: "landlord",
      firstName: juristic ? undefined : first,
      lastName: juristic ? undefined : last,
      companyName: juristic ? pick(r, JURISTIC) : undefined,
      email: email(first, last, 500 + i),
      phone: `08${int(r, 2, 4)}${String(int(r, 1000000, 9999999))}`,
      idNumber: juristic ? undefined : makeSAId(r),
      vatNumber: juristic ? `4${int(r, 100000000, 999999999)}` : undefined,
    })
  }

}

/** Supplier rows — all three archetypes, including the two a fresh local DB used to reject outright. */
function addVendorRows(rows: GtRow[], r: () => number, spec: BookSpec): void {
  let index = rows.length

  for (let i = 0; i < (spec.vendors ?? 0); i++) {
    // All three supplier archetypes — including the two the LOCAL migration used to reject outright.
    const supplierType = pick(r, ["contractor", "managing_scheme", "utility"] as const)
    const NAMER: Record<typeof supplierType, () => string> = {
      utility: () => `${pick(r, CITY)[0]} Municipality`,
      managing_scheme: () => `${pick(r, SUBURB)} Body Corporate`,
      contractor: () => `${pick(r, LAST)} ${pick(r, TRADES)}`,
    }
    const name = NAMER[supplierType]()
    rows.push({
      index: index++,
      entity: "vendor",
      companyName: name,
      email: `${name.toLowerCase().replaceAll(/[^a-z0-9]/g, "")}@suppliers.co.za`,
      phone: `01${int(r, 1, 9)}${String(int(r, 1000000, 9999999))}`,
      supplierType,
      registrationNumber: `${int(r, 2000, 2024)}/${int(r, 100000, 999999)}/07`,
      vatNumber: `4${int(r, 100000000, 999999999)}`,
    })
  }

}

/** Agent rows — these become INVITES, not contacts. */
function addAgentRows(rows: GtRow[], r: () => number, spec: BookSpec): void {
  const email = emailFor
  let index = rows.length

  for (let i = 0; i < (spec.agents ?? 0); i++) {
    const first = pick(r, FIRST)
    const last = pick(r, LAST)
    rows.push({
      index: index++,
      entity: "agent",
      firstName: first,
      lastName: last,
      email: email(first, last, 900 + i),
      phone: `08${int(r, 2, 4)}${String(int(r, 1000000, 9999999))}`,
      agentRole: pick(r, ["property_manager", "agent"] as const),
    })
  }
}
