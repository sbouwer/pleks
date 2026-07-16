/**
 * lib/import/importRunner.ts — bulk CSV/XLSX import engine (properties / units / tenants / leases)
 *
 * Auth:   service client passed in via ImportContext; org-scoped by the caller (agent import flow)
 * Data:   properties, units, tenants, leases, contacts (+ contact_bank_accounts), audit_log
 * Notes:  Phased pipeline (parse → route → create → audit). Writes one bulk_import audit row at the
 *         end, keyed to the import session. Per-entity creates are not individually audited.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAudit } from "@/lib/audit/recordAudit"
import { normaliseDate, normaliseMoneyCents, normalisePercent, normalisePaymentDueDay } from "./normalise"
import {
  classifyLeaseType, classifyEscalationType, classifyBoolean, classifyProvince, classifyTenantEntity,
  classifyJuristicType, classifyGender, classifyFurnishing, classifyDepositInterestTo,
  SA_PROVINCES, type Classification,
} from "./classify"
import { detectMappingCollisions } from "./columnMapper"
import { checkLeasePlausibility, looksLikeEmail, looksLikeFormula, neutraliseFormula } from "./plausibility"
import {
  matchExistingContact, describeMatch, AUTO_LINK, type IdentityCandidate, type MatchBasis,
} from "./identity"
import { resolveDepositRate, postOpeningDeposit } from "./depositImport"
import { normaliseBranchCode } from "./bankImport"
import { bankAccountColumns } from "@/lib/crypto/bankAccount"
import { idNumberColumns, validateSAIdNumber, hashIdNumber } from "@/lib/crypto/idNumber"
import { optionalEnv } from "@/lib/env"
import { HOLIDAY_TABLE_COVERS_THROUGH, saTodayISO } from "@/lib/dates"
import { determineCpaApplicability } from "@/lib/leases/cpaApplicability"

// ── Types ──────────────────────────────────────────────────────────────

export interface MappedField {
  column: string
  field: string
  entity: string
}

export interface ColumnMapping {
  [column: string]: MappedField
}

export interface ImportError {
  rowIndex: number
  field: string
  message: string
  severity: "error" | "warning"
}

export interface ImportResult {
  propertiesCreated: number
  unitsCreated: number
  tenantsCreated: number
  leasesCreated: number
  historyCreated: number
  notesCreated: number
  contractorsCreated: number
  landlordsImported: number
  /** Properties attached to a real landlord ENTITY (not just denormalised owner text). */
  landlordsLinked: number
  agentInvitesSent: number
  bankAccountsImported: number
  /** Total deposit money carried into the deposit/trust sub-ledger as opening balances. */
  depositsMigratedCents: number
  skipped: number
  /** Rows NOT imported because we could not tell whether they are someone we already have.
   *  The agent must answer these; until they do, the rows stay out — and the report says so, by name. */
  identityHolds: IdentityHold[]
  errors: ImportError[]
  pendingLandlordLinks: Array<{ pendingLandlordId: string; name: string; email: string }>
  agentInvites: Array<{ email: string; role: string }>
}

export type ConflictResolution = "skip" | "co_tenant" | "previous" | "duplicate"

/**
 * The agent's answer to "is this the same person?" — keyed by the row of the FILE, which is what they see.
 *
 * NOT folded into ConflictDecision, deliberately. That type is UNIT-keyed (`unitKey` + `rowIndices`) because it
 * models co-tenants sharing a unit; an identity hold is per-ROW and carries a candidate CONTACT, so reusing it
 * would mean inventing a fake unitKey for a landlord row who has no unit at all. Same FLOW (analyse → confirm →
 * execute, per the spec), correctly-shaped type.
 */
export type IdentityDecision =
  | { action: "link"; contactId: string }     // the agent says: same person — use the record we already have
  | { action: "create" }                      // the agent says: someone new — create them

/** A row the importer REFUSED to guess about. It was NOT imported, and the agency is told exactly that. */
export interface IdentityHold {
  rowIndex: number
  role: string
  incoming: { name: string; email: string | null }
  match: { contactId: string; name: string; email: string | null; confidence: number; basis: MatchBasis }
}

export interface ConflictDecision {
  unitKey: string
  rowIndices: number[]
  resolution: ConflictResolution
  /** For "previous": which row indices are the previous tenants */
  previousIndices?: number[]
}

/**
 * What to do with a lease whose end date has already passed.
 *   import_active_only — no lease row; the tenancy is recorded as tenancy_history instead ("Skip expired
 *                        leases", the wizard's default and recommended option)
 *   import_all         — create the lease with status 'expired' ("Import as expired")
 *
 * A third member, `import_as_history`, used to be declared here with NO branch anywhere — so setting it
 * typechecked and silently produced `import_all` behaviour: expired leases created as lease rows, the exact
 * opposite of "as history". A dead enum member that means its own opposite is a fail-open waiting for its
 * first caller. Removed; `import_active_only` already IS the as-history behaviour.
 */
export type ExpiredDecision = "import_active_only" | "import_all"

export interface ImportDecisions {
  conflicts: ConflictDecision[]
  expiredLeases: ExpiredDecision
  /** Row indices to skip entirely */
  skipRows: number[]
  /** Step 3's "Keep active" per-row exception: import this lease as LIVE even though its end date has passed.
   *  The wizard has always offered this checkbox; the runner had no concept of it, so it did nothing. */
  forceActiveRows: number[]
  /** F-10: the agent attested, in Step 2, that they hold the tenants' consent to migrate banking details.
   *  This is the AGENT'S declaration — never the data subject's consent. Undefined/false ⇒ bank accounts are
   *  recorded as UNCONSENTED (they used to be written `consent_given: true` unconditionally). */
  bankConsentAttested?: boolean
  /** The agency confirmed it HOLDS these deposits. Without it, nothing is posted to the trust ledger. */
  depositsHeldAttested?: boolean
  /** The agent's answers to the identity holds a PREVIOUS analyse/execute raised, keyed by file-row index.
   *  Absent ⇒ nothing was asked yet, so a grey-band match HOLDS the row rather than guessing. */
  identityDecisions?: Record<number, IdentityDecision>
  /** The file's RAW header row, in file order.
   *
   *  Needed because papaparse builds each row as an OBJECT: two columns with the SAME header name collapse into
   *  one key and the second silently overwrites the first. By the time the runner sees `rows`, the duplicate is
   *  gone without a trace — there is no way to detect it downstream, only here. An agency with two "Email"
   *  columns (a merged export, a copy-paste) loses one of them and is never told which. */
  fileHeaders?: string[]
}

type TenantRole = "primary" | "co_tenant" | "previous"

interface UnitGroupEntry {
  index: number
  row: Record<string, string>
  role: TenantRole
}

interface UnitGroup {
  propertyName: string
  unitNumber: string
  rows: UnitGroupEntry[]
}

/** Shared context passed to all import phase functions. */
interface ImportContext {
  mapping: ColumnMapping
  decisions: ImportDecisions
  orgId: string
  agentId: string
  importSessionId: string | undefined
  supabase: SupabaseClient
  result: ImportResult
  /** decisions.forceActiveRows as a Set — consulted once per unit group. */
  forceActiveRows: Set<number>
  unitIdCache: Map<string, string>
  /** unitKey → the property that unit belongs to. `leases.property_id` is NOT NULL and has no trigger to
   *  derive it from unit_id, so the lease insert must carry it explicitly. */
  unitPropertyCache: Map<string, string>
  tenantIdCache: Map<string, string>
}

// Log-only guard for Supabase query errors (keeps call sites flat — no control-flow change)
function logIfError(label: string, error: { message: string } | null) {
  if (error) console.error(`${label}:`, error.message)
}

// ── Field helpers ──────────────────────────────────────────────────────

/**
 * A dedup lookup that FAILED is not a dedup lookup that found NOTHING.
 *
 * Every "does this already exist?" query in this file used to do:
 *
 *     const { data, error } = await ...select()...maybeSingle()
 *     if (error) console.error(...)          // ← checked, logged, and then NOT ACTED ON
 *     if (data) { skipped++; return }        // ← error ⇒ data is null ⇒ fall through to INSERT
 *
 * which means a transient query failure reads as "this row does not exist yet" and the importer creates it
 * AGAIN. That is the exact fail-open this whole arc exists to kill — a write that fails, an error that is
 * swallowed, a caller that proceeds as if all is well — and it was sitting in the guard that protects against
 * duplication.
 *
 * It matters most under precisely the conditions the auto-retry is FOR. A dropped connection fails SELECTs, not
 * only INSERTs; the retry then re-runs the book while the database is still flapping, a dedup SELECT errors,
 * the guard falls open, and a SECOND active lease is created for the same tenant and unit. `postOpeningDeposit`
 * keys on `lease_id` — a new lease is a new key — so it posts a SECOND opening balance into the trust ledger.
 * The agency's trust account now over-states the deposits it holds. Money, silently wrong, from a dropped packet.
 *
 * My convergence proof did not cover this, because the crash client only ever failed WRITES. The pre-PR walk
 * caught it. So: a failed lookup THROWS, the row is refused and reported by name, and nothing is written on the
 * strength of a question we could not ask.
 */
function assertLookupOk(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what} lookup failed: ${error.message}`)
}

function getField(
  row: Record<string, string>,
  fieldName: string,
  mapping: ColumnMapping
): string {
  // The mapping key IS the original column name from the file
  for (const [columnName, mapped] of Object.entries(mapping)) {
    if (mapped.field === fieldName) {
      const raw = (row[columnName] ?? row[mapped.column] ?? "").trim()
      // FORMULA NEUTRALISATION, at the one boundary every entity path reads through — tenant, landlord,
      // supplier, agent, property. A value beginning `=`, `+`, `@` (or a non-numeric `-`) is EXECUTED by Excel
      // when the next person opens an export of this data, and the next person is the agency's own bookkeeper.
      // The name field is attacker-controlled: anyone who can get onto a rent roll can put a formula in it.
      // Storing it verbatim would make Pleks the delivery mechanism for an attack on our own customer.
      //
      // The row is also FLAGGED (see the scan in runImport) — silently altering an agency's data is its own
      // sin, so we neutralise it AND say that we did.
      return looksLikeFormula(raw) ? neutraliseFormula(raw) : raw
    }
  }
  return ""
}

/**
 * getField, but it also hands back the SOURCE HEADER the value came from. Money needs this: the unit
 * (rands vs already-cents) is a property of the agency's column header, not of the Pleks field name it was
 * mapped onto — see normaliseMoneyCents (F-8). `column` is "" when the field is not mapped.
 */
function getFieldSource(
  row: Record<string, string>,
  fieldName: string,
  mapping: ColumnMapping
): { value: string; column: string } {
  for (const [columnName, mapped] of Object.entries(mapping)) {
    if (mapped.field === fieldName) {
      return { value: (row[columnName] ?? row[mapped.column] ?? "").trim(), column: columnName }
    }
  }
  return { value: "", column: "" }
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? "", lastName: parts[0] ?? "" }
  }
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  }
}

const BUSINESS_SUFFIX_RE = /\b(pty\.?\s*ltd|pty|cc|bk|npc|rf|ltd|inc|corp|trust|holdings|properties|investments|group|enterprises|solutions)\b/i

function resolveEntityType(companyField: string, displayName: string): "organisation" | "individual" {
  if (companyField.trim()) return "organisation"
  if (displayName && BUSINESS_SUFFIX_RE.test(displayName)) return "organisation"
  return "individual"
}

/** `units.unit_number` is NOT NULL, and a blank cell (a freestanding house — the commonest SA residential
 *  letting) means "the only unit". The SSOT for that default: used for the group key, the existence lookup
 *  AND the insert, so all three agree on which database row a row belongs to. */
function normaliseUnitNumber(raw: string): string {
  return raw.trim() || "1"
}

/** Still used for non-statutory booleans (units.furnished). The STATUTORY booleans — cpa_applies,
 *  is_fixed_term — go through classifyBoolean, which flags rather than failing toward false. */
function normaliseBoolean(raw: string): boolean {
  const s = raw.toLowerCase().trim()
  return s === "true" || s === "yes" || s === "y" || s === "1" || s === "ja"
}

// normaliseLeaseType / normaliseEscalationType used to live here and GUESSED (→ "residential" / → "fixed").
// They are now classifyLeaseType / classifyEscalationType in ./classify — tested, vocabulary-explicit, and
// they FLAG an unrecognised value instead of defaulting it (F-7). buildLeaseData turns a flag into a
// row-level review item and writes nothing to the column.

function normalisePropertyType(raw: string): "residential" | "commercial" | "mixed" | null {
  const s = raw.toLowerCase().trim()
  if (s.includes("comm")) return "commercial"
  if (s.includes("mix")) return "mixed"
  if (s.includes("res")) return "residential"
  return null
}

function normaliseOwnerBankType(raw: string): "cheque" | "savings" | "transmission" | null {
  const s = raw.toLowerCase().trim()
  if (s.includes("cheque") || s.includes("check") || s.includes("current")) return "cheque"
  if (s.includes("sav")) return "savings"
  if (s.includes("trans")) return "transmission"
  return null
}

function normaliseEmploymentType(raw: string): string | null {
  const s = raw.toLowerCase().trim()
  if (!s) return null
  if (s === "permanent" || s.includes("perm")) return "permanent"
  if (s === "contract" || s.includes("temp")) return "contract"
  if (s.includes("self") || s.includes("freelance")) return "self_employed"
  if (s === "student") return "student"
  if (s === "unemployed" || s === "none") return "unemployed"
  if (s === "retired") return "retired"
  return "other"
}

function normalisePreferredContact(raw: string): string | null {
  const s = raw.toLowerCase().trim()
  if (!s) return null
  if (s.includes("whats")) return "whatsapp"
  if (s === "sms" || s.includes("text")) return "sms"
  if (s === "email") return "email"
  if (s === "call" || s.includes("phone")) return "call"
  return null
}

function resolveName(row: Record<string, string>, mapping: ColumnMapping): { firstName: string; lastName: string; companyName: string } {
  const firstName = getField(row, "first_name", mapping)
  const lastName = getField(row, "last_name", mapping)
  const companyName = getField(row, "company_name", mapping) || getField(row, "legal_name", mapping) || getField(row, "trading_name", mapping)

  if (firstName || lastName) return { firstName, lastName, companyName }

  const fullName = getField(row, "__split_name", mapping)
  const split = fullName ? splitFullName(fullName) : { firstName: "", lastName: "" }
  return { ...split, companyName }
}

function getExtraColumns(
  row: Record<string, string>,
  mapping: ColumnMapping
): Record<string, string> {
  const mappedColumns = new Set(Object.keys(mapping))
  const extras: Record<string, string> = {}
  // Include columns explicitly routed to notes (they're in the mapping but have no schema column)
  for (const [col, m] of Object.entries(mapping)) {
    if (m.field === "tenant_notes" || m.field === "unit_notes" || m.field === "lease_notes") {
      const val = (row[col] ?? "").trim()
      if (val) extras[col] = val
    }
  }
  // Plus all unmapped columns
  for (const [col, value] of Object.entries(row)) {
    if (!mappedColumns.has(col) && value.trim()) {
      extras[col] = value.trim()
    }
  }
  return extras
}

function determineRole(
  rowIndex: number,
  row: Record<string, string>,
  conflict: ConflictDecision | undefined,
  mapping: ColumnMapping
): TenantRole {
  let role: TenantRole = "primary"

  if (conflict?.resolution === "previous" && conflict.previousIndices?.includes(rowIndex)) {
    role = "previous"
  } else if (conflict?.resolution === "co_tenant" && conflict.rowIndices[0] !== rowIndex) {
    role = "co_tenant"
  }

  const tenantRoleField = getField(row, "tenant_role", mapping)
  if (tenantRoleField) {
    const normalized = tenantRoleField.toLowerCase().trim()
    if (normalized === "co_tenant" || normalized === "co-tenant") role = "co_tenant"
    else if (normalized === "previous") role = "previous"
  }

  return role
}

// ── Phase 1: Group rows by unit ────────────────────────────────────────

function buildUnitGroups(
  rows: IndexedRow[],
  ctx: ImportContext,
  conflictMap: Map<number, ConflictDecision>,
  skipSet: Set<number>
): Map<string, UnitGroup> {
  const unitGroups = new Map<string, UnitGroup>()
  const unitColumnMapped = Object.values(ctx.mapping).some((m) => m.field === "unit_number")

  // `i` is the row's index IN THE FILE, not its position among the tenant rows. It is what every ImportError
  // reports, and it is the key `skipRows` / `conflicts` are expressed in — indexing the tenant subset instead
  // mis-numbered both whenever the file also carried vendor/landlord/agent rows.
  for (const { row, index: i } of rows) {
    if (skipSet.has(i)) { ctx.result.skipped++; continue }

    const conflict = conflictMap.get(i)
    if (conflict?.resolution === "skip") { ctx.result.skipped++; continue }
    if (conflict?.resolution === "duplicate" && conflict.rowIndices[0] !== i) { ctx.result.skipped++; continue }

    const propertyName = getField(row, "property_name", ctx.mapping)
    // Normalise HERE, not just at insert. upsertUnit writes `unitNumber || "1"` for a blank cell (a
    // freestanding house), so if the group key kept the RAW blank, a blank-unit group and an explicit "1"
    // group would be two different keys resolving to the SAME database row — and both tenants would get an
    // active lease on one unit. One normalisation, used for the key, the lookup and the insert.
    const unitNumber = normaliseUnitNumber(getField(row, "unit_number", ctx.mapping))
    const unitKey = `${propertyName.toLowerCase()}|${unitNumber.toLowerCase()}`
    const role = determineRole(i, row, conflict, ctx.mapping)

    const existing = unitGroups.get(unitKey)
    if (existing) {
      // SILENT MERGE GUARD. Extra rows in a unit group are treated as CO-TENANTS — which is right when the file
      // really says two people share a unit. But if no unit column was mapped at all, every unit normalises to
      // "1", so every tenant in a property collapses into ONE lease and the others become co-tenants of a lease
      // they have nothing to do with. The stress harness caught exactly this on a PayProp export ("Unit No" was
      // not a recognised header): five leases became one, four tenants were absorbed, and NOTHING was reported.
      //
      // Aliases fix the exporters we have seen. This fixes the ones we have not: if the co-tenancy is an
      // artefact of a missing column rather than a fact in the file, say so.
      if (!unitColumnMapped) {
        ctx.result.errors.push({
          rowIndex: i,
          field: "unit_number",
          severity: "warning",
          message:
            `No unit column was mapped, so this row was treated as a CO-TENANT of the lease created for ` +
            `"${propertyName || "(unnamed property)"}" rather than as its own lease. If these are separate ` +
            `units, map the unit column and re-run — otherwise separate tenants will share one lease.`,
        })
      }
      existing.rows.push({ index: i, row, role })
    } else {
      unitGroups.set(unitKey, { propertyName, unitNumber, rows: [{ index: i, row, role }] })
    }
  }

  return unitGroups
}

// ── Phase 2: Upsert properties + units ─────────────────────────────────

async function upsertProperty(
  propertyName: string,
  row: Record<string, string>,
  rowIndex: number,
  ctx: ImportContext,
  cache: Map<string, string>
): Promise<string | null> {
  const cacheKey = propertyName.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const { data: existing, error: existingError } = await ctx.supabase
    .from("properties").select("id").eq("org_id", ctx.orgId).ilike("name", propertyName).limit(1).maybeSingle()
  assertLookupOk(existingError, "property")

  if (existing) {
    const id = String(existing.id)
    cache.set(cacheKey, id)
    return id
  }

  // `properties` requires address_line1, city and province (all NOT NULL; province additionally CHECKed against
  // the nine SA provinces — 003_properties.sql). The old code passed `|| null` for each, so Postgres rejected
  // EVERY property insert whose file lacked those columns, and the failure was swallowed into a generic
  // "Failed to create property". Resolve them explicitly and refuse the property with a message that names
  // what is missing — never invent an address.
  const addressLine1 = getField(row, "address", ctx.mapping)
  const city = getField(row, "city", ctx.mapping)
  const provinceRaw = getField(row, "province", ctx.mapping)
  const province = provinceRaw ? classifyProvince(provinceRaw) : null

  const missing: string[] = []
  if (!addressLine1) missing.push("address")
  if (!city) missing.push("city")
  if (!provinceRaw) missing.push("province")

  if (missing.length > 0) {
    ctx.result.errors.push({
      rowIndex, field: "property_name", severity: "error",
      message: `Property "${propertyName}" is missing required ${missing.join(", ")} — a property cannot be ` +
        `created without ${missing.length > 1 ? "these" : "this"}. Map the ${missing.join("/")} column(s) and re-import.`,
    })
    return null
  }
  if (province && !province.ok) {
    ctx.result.errors.push({
      rowIndex, field: "province", severity: "error",
      message: `Unrecognised province "${province.raw}" for property "${propertyName}" — must be one of: ` +
        `${SA_PROVINCES.join(", ")}.`,
    })
    return null
  }

  const rawPropertyType = getField(row, "property_type_import", ctx.mapping)
  const normPropertyType = rawPropertyType ? normalisePropertyType(rawPropertyType) : null
  const rawOwnerBankType = getField(row, "owner_bank_type", ctx.mapping)
  const normOwnerBankType = rawOwnerBankType ? normaliseOwnerBankType(rawOwnerBankType) : null

  const { data: created, error } = await ctx.supabase
    .from("properties")
    .insert({
      org_id: ctx.orgId,
      name: propertyName,
      address_line1: addressLine1,
      suburb: getField(row, "suburb", ctx.mapping) || null,
      city,
      province: province?.ok ? province.value : undefined,
      postal_code: getField(row, "postal_code", ctx.mapping) || null,
      erf_number: getField(row, "erf_number", ctx.mapping) || null,
      ...(normPropertyType ? { type: normPropertyType } : {}),
      owner_name: getField(row, "owner_name", ctx.mapping) || null,
      owner_email: getField(row, "owner_email", ctx.mapping) || null,
      owner_phone: getField(row, "owner_phone", ctx.mapping) || null,
      owner_bank_name: getField(row, "owner_bank_name", ctx.mapping) || null,
      owner_bank_account: getField(row, "owner_bank_account", ctx.mapping) || null,
      owner_bank_branch: getField(row, "owner_bank_branch", ctx.mapping) || null,
      ...(normOwnerBankType ? { owner_bank_type: normOwnerBankType } : {}),
      // Coverage (field audit): sectional-title, levies and insurance — a large share of SA agencies manage
      // sectional-title stock, and every one of these columns already existed.
      ...propertyCoverageColumns(row, ctx),
    })
    .select("id").single()

  if (error || !created) {
    ctx.result.errors.push({
      rowIndex, field: "property_name", severity: "error",
      message: `Failed to create property "${propertyName}": ${error?.message ?? "unknown error"}`,
    })
    return null
  }

  const id = String(created.id)
  cache.set(cacheKey, id)
  ctx.result.propertiesCreated++
  return id
}

/** Property columns the importer could not previously take. `is_sectional_title` is DERIVED from the presence
 *  of a scheme number rather than asked for separately — an agency that gives you a sectional-title number has
 *  told you it is sectional title. */
function propertyCoverageColumns(row: Record<string, string>, ctx: ImportContext): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  const line2 = getField(row, "address_line2", ctx.mapping)
  if (line2) out.address_line2 = line2

  const levy = getFieldSource(row, "levy_amount_cents", ctx.mapping)
  if (levy.value) {
    const cents = normaliseMoneyCents(levy.value, levy.column)
    if (cents !== null) out.levy_amount_cents = cents
  }

  const levyAccount = getField(row, "levy_account_number", ctx.mapping)
  if (levyAccount) out.levy_account_number = levyAccount

  const scheme = getField(row, "sectional_title_number", ctx.mapping)
  if (scheme) {
    out.sectional_title_number = scheme
    out.is_sectional_title = true
  }

  const ownerTax = getField(row, "owner_tax_number", ctx.mapping)
  if (ownerTax) out.owner_tax_number = ownerTax

  const policy = getField(row, "insurance_policy_number", ctx.mapping)
  if (policy) out.insurance_policy_number = policy

  const insurer = getField(row, "insurance_provider", ctx.mapping)
  if (insurer) out.insurance_provider = insurer

  const renewal = getField(row, "insurance_renewal_date", ctx.mapping)
  if (renewal) {
    const iso = normaliseDate(renewal)
    if (iso) out.insurance_renewal_date = iso
  }

  return out
}

async function upsertUnit(
  unitKey: string,
  group: UnitGroup,
  propertyId: string,
  ctx: ImportContext
): Promise<string | null> {
  const cached = ctx.unitIdCache.get(unitKey)
  if (cached) return cached

  // Already normalised in buildUnitGroups (the group key uses the same value). Re-applied here so the lookup
  // and the insert can never drift apart again: they used to differ (lookup on the raw value, insert on
  // `|| "1"`), so a blank unit number looked up `ILIKE ''`, matched nothing, and inserted "1" AGAIN on every
  // re-run → a second unit with a new unit_id, which the lease dedup then missed → a second active lease for
  // the same tenant. Re-running is the documented remedy for a rejected row, so this fired in normal use.
  const unitNumber = normaliseUnitNumber(group.unitNumber)

  const { data: existing, error: existingError } = await ctx.supabase
    .from("units").select("id").eq("org_id", ctx.orgId).eq("property_id", propertyId).ilike("unit_number", unitNumber).limit(1).maybeSingle()
  assertLookupOk(existingError, "unit")

  if (existing) {
    const id = String(existing.id)
    ctx.unitIdCache.set(unitKey, id)
    return id
  }

  const row = group.rows[0]?.row ?? {}
  const bedrooms = getField(row, "bedrooms", ctx.mapping)
  const bathrooms = getField(row, "bathrooms", ctx.mapping)
  const floorRaw = getField(row, "unit_floor", ctx.mapping)
  const sizeRaw = getField(row, "unit_size_m2", ctx.mapping)
  const parkingRaw = getField(row, "parking_bays", ctx.mapping)
  const furnishedRaw = getField(row, "furnished", ctx.mapping)

  const { data: created, error } = await ctx.supabase
    .from("units")
    .insert({
      property_id: propertyId,
      org_id: ctx.orgId,
      unit_number: unitNumber,
      bedrooms: bedrooms ? Number.parseInt(bedrooms, 10) || null : null,
      bathrooms: bathrooms ? Number.parseFloat(bathrooms) || null : null,
      floor: floorRaw ? Number.parseInt(floorRaw, 10) || null : null,
      size_m2: sizeRaw ? Number.parseFloat(sizeRaw) || null : null,
      parking_bays: parkingRaw ? Number.parseInt(parkingRaw, 10) || null : null,
      ...(furnishedRaw ? { furnished: normaliseBoolean(furnishedRaw) } : {}),
      // Coverage (field audit): columns that exist and an agency's book carries.
      ...unitCoverageColumns(row, ctx),
    })
    .select("id").single()

  if (error || !created) {
    // Surface the Postgres message. Swallowing it into a generic "Failed to create unit" is precisely how the
    // NOT NULL / phantom-column faults in this file stayed invisible for so long.
    ctx.result.errors.push({
      rowIndex: group.rows[0]?.index ?? -1, field: "unit_number", severity: "error",
      message: `Failed to create unit "${unitNumber}": ${error?.message ?? "unknown error"}`,
    })
    return null
  }

  const id = String(created.id)
  ctx.unitIdCache.set(unitKey, id)
  ctx.result.unitsCreated++
  return id
}

/** Unit columns the importer could not previously take. `furnishing_status` is CHECK-constrained
 *  (unfurnished|semi_furnished|furnished), so an unrecognised value is simply not written rather than
 *  rejected by Postgres. `market_rent_cents` is money and goes through the same header-aware parser as rent. */
function unitCoverageColumns(row: Record<string, string>, ctx: ImportContext): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  const market = getFieldSource(row, "market_rent_cents", ctx.mapping)
  if (market.value) {
    const cents = normaliseMoneyCents(market.value, market.column)
    if (cents !== null) out.market_rent_cents = cents
  }

  const unitType = getField(row, "unit_type", ctx.mapping)
  if (unitType) out.unit_type = unitType

  const furnishing = getField(row, "furnishing_status", ctx.mapping)
  if (furnishing) {
    const f = classifyFurnishing(furnishing)
    if (f) out.furnishing_status = f
  }

  const access = getField(row, "access_instructions", ctx.mapping)
  if (access) out.access_instructions = access

  return out
}

async function upsertPropertiesAndUnits(
  unitGroups: Map<string, UnitGroup>,
  ctx: ImportContext
): Promise<void> {
  const propertyIdCache = new Map<string, string>()

  for (const [unitKey, group] of unitGroups) {
    const firstRow = group.rows[0]
    if (!firstRow || !group.propertyName) {
      if (firstRow) ctx.result.errors.push({ rowIndex: firstRow.index, field: "property_name", message: "Property name is required", severity: "error" })
      continue
    }

    try {
      // upsertProperty now raises its OWN precise error (missing address/city/province, bad province, or the
      // Postgres message) — no generic "Failed to create property" on top of it.
      const propertyId = await upsertProperty(group.propertyName, firstRow.row, firstRow.index, ctx, propertyIdCache)
      if (!propertyId) continue

      // upsertUnit raises its own error (with the Postgres message) when it fails.
      const unitId = await upsertUnit(unitKey, group, propertyId, ctx)
      if (unitId) {
        ctx.unitPropertyCache.set(unitKey, propertyId)   // leases.property_id is NOT NULL — carry it forward
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      ctx.result.errors.push({ rowIndex: firstRow.index, field: "property_name", message: `Property/unit error: ${msg}`, severity: "error" })
    }
  }
}

// ── Phase 3: Create tenants ────────────────────────────────────────────

async function createTenants(
  unitGroups: Map<string, UnitGroup>,
  ctx: ImportContext
): Promise<void> {
  for (const [, group] of unitGroups) {
    for (const entry of group.rows) {
      await upsertTenant(entry, ctx)
    }
  }
}

/**
 * The tenantIdCache key for an email cell. A cell can hold "a@x, b@x" (joint tenants) — the PRIMARY tenant is
 * the first. EVERY cache write and lookup goes through this one function so the tenant-phase key and the
 * lease-phase lookup are guaranteed identical (walker: three sites derived the key three different ways and
 * diverged for a comma-in-cell row whose name lacked a spaced " & ").
 */
function primaryEmailKey(cell: string): string {
  return cell.split(",")[0]?.trim().toLowerCase() ?? ""
}

/** Cache a tenant id under its email for within-batch dedup — but ONLY when there is an email. An email-less
 *  tenant (the relaxed migration case) is deliberately kept out of the cache so two of them never collide on the
 *  empty key; those dedup on SA ID / name+phone via resolveIdentity instead. */
function cacheTenant(ctx: ImportContext, email: string, tenantId: string): void {
  if (email) ctx.tenantIdCache.set(email, tenantId)
}

/**
 * F-6a: given an EXISTING contact, return its tenant id — resolving the tenant row (or creating one if the
 * contact has none). NEVER returns a contacts id. Both the single-tenant and co-tenant paths route through
 * here so the "cache a contacts.id as a tenants.id" bug can't survive in one sibling and not the other.
 */
async function tenantIdForExistingContact(
  contactId: string,
  ctx: ImportContext,
  extra: { employerName?: string | null; occupation?: string | null } = {},
): Promise<{ tenantId: string; created: boolean } | null> {
  const { data: existingTenant, error: etErr } = await ctx.supabase
    .from("tenants").select("id").eq("contact_id", contactId).is("deleted_at", null).limit(1).maybeSingle()
  // The DB backstop is real here — uq_tenants_org_contact_live (org_id, contact_id) WHERE deleted_at IS NULL
  // means a fall-through insert violates the constraint rather than duplicating. So this site was SAFE. It is
  // still guarded, because it was the only lookup in the file whose safety depended on the reader knowing an
  // index exists: "this cannot duplicate" should be legible from the code, not from a constraint two files away.
  // The index remains, as defence in depth.
  assertLookupOk(etErr, "tenant for existing contact")
  if (existingTenant) return { tenantId: String(existingTenant.id), created: false }

  // Contact exists but has no tenant row — create it. The partial unique (org_id, contact_id) WHERE
  // deleted_at IS NULL makes this idempotent under a repeat/concurrent run.
  const { data: newTenant, error: ntErr } = await ctx.supabase
    .from("tenants")
    .insert({ org_id: ctx.orgId, contact_id: contactId, employer_name: extra.employerName ?? null, occupation: extra.occupation ?? null })
    .select("id").single()
  if (ntErr || !newTenant) {
    console.error("importRunner tenant-for-existing-contact insert failed:", ntErr?.message ?? "unknown")
    return null
  }
  return { tenantId: String(newTenant.id), created: true }
}

async function upsertTenant(entry: UnitGroupEntry, ctx: ImportContext): Promise<void> {
  // Co-tenant detection: "Donovan & Apphia" with comma-separated emails
  const rawFirstName = getField(entry.row, "first_name", ctx.mapping)
  const rawEmail = getField(entry.row, "email", ctx.mapping)
  const hasAmpersand = rawFirstName.includes(" & ")
  const emails = rawEmail.split(",").map((e) => e.trim()).filter(Boolean)

  if (hasAmpersand && emails.length >= 2) {
    const nameParts = rawFirstName.split(" & ")
    const lastName = getField(entry.row, "last_name", ctx.mapping)
    const phones = getField(entry.row, "phone", ctx.mapping).split(",").map((p) => p.trim()).filter(Boolean)

    // Create primary tenant
    await insertSingleTenant({
      firstName: nameParts[0]?.trim() ?? rawFirstName,
      lastName,
      email: emails[0],
      phone: phones[0] ?? "",
      idNumber: getField(entry.row, "id_number", ctx.mapping),
      entry,
      ctx,
    })

    // Create co-tenant
    await insertSingleTenant({
      firstName: nameParts[1]?.trim() ?? "",
      lastName,
      email: emails[1],
      phone: phones[1] ?? "",
      idNumber: "",
      entry,
      ctx,
    })
    return
  }

  // Single tenant (normal path)
  const email = primaryEmailKey(rawEmail)
  if (!email) {
    // RELAXED for MIGRATION: a legacy book legitimately carries email-less tenants, and dropping the row is
    // migration data loss. Import with a loud WARNING instead. Dedup does NOT depend on email — resolveIdentity
    // matches on SA ID / name+phone — and an email-less tenant is deliberately kept OUT of tenantIdCache (keyed
    // by email), so two of them never collide on the empty key. Email stays required on live agent-side create.
    flagForReview(ctx, entry.index, "email",
      "No email on this tenant. Imported without one — but email is how we recognise and reach a tenant; add it " +
      "before serving a notice or running a screening.")
  }

  const dataQualityTags = checkTenantIdentity(email, entry, ctx)

  // cacheTenant never stores the empty key, so has("") is always false — no `email &&` guard needed here.
  if (ctx.tenantIdCache.has(email)) return

  try {
    // IDENTITY FIRST. A tenant matched on their SA ID is the same tenant, whatever email the new book gives.
    // And a GREY-BAND tenant is HELD — which holds their LEASE too. That is correct: a lease silently attached
    // to the WRONG person is far worse than a lease that waits for one question, and the agency keeps the other
    // ninety-nine rows. Strictness costs the ROW, never the BOOK.
    const outcome = await resolveIdentity("tenant", identityCandidate(entry.row, ctx), entry.index, ctx)
    if (outcome.kind === "hold") return

    const existing = outcome.kind === "link" ? { id: outcome.contactId } : null

    if (existing) {
      // F-6a: `existing.id` is a CONTACTS id — resolve (or create) the TENANT for it via the shared helper.
      const resolved = await tenantIdForExistingContact(String(existing.id), ctx, {
        employerName: getField(entry.row, "employer_name", ctx.mapping) || null,
        occupation: getField(entry.row, "occupation", ctx.mapping) || null,
      })
      if (!resolved) {
        ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: "Failed to resolve tenant for existing contact", severity: "error" })
        return
      }
      cacheTenant(ctx, email, resolved.tenantId)
      if (resolved.created) ctx.result.tenantsCreated++
      else ctx.result.skipped++
      return
    }

    const { firstName, lastName, companyName: tenantCompany } = resolveName(entry.row, ctx.mapping)
    const displayForTenant = tenantCompany || `${firstName} ${lastName}`.trim()

    const dobRaw = getField(entry.row, "date_of_birth", ctx.mapping)
    const idTypeRaw = getField(entry.row, "id_type", ctx.mapping)
    const normIdType = ["sa_id", "passport", "asylum_permit"].includes(idTypeRaw) ? idTypeRaw : null

    const { data: contact, error: contactError } = await ctx.supabase
      .from("contacts")
      .insert({
        org_id: ctx.orgId,
        entity_type: resolveEntityType(tenantCompany, displayForTenant),
        primary_role: "tenant",
        first_name: firstName || (tenantCompany ? null : "Unknown"),
        last_name: lastName || (tenantCompany ? null : "Unknown"),
        company_name: tenantCompany || null,
        primary_email: email || null,
        primary_phone: getField(entry.row, "phone", ctx.mapping) || null,
        ...idNumberColumns(getField(entry.row, "id_number", ctx.mapping)), // encrypted at rest + lookup hash
        ...(normIdType ? { id_type: normIdType } : {}),
        date_of_birth: dobRaw ? normaliseDate(dobRaw) : null,
        nationality: getField(entry.row, "nationality", ctx.mapping) || null,
        registration_number: getField(entry.row, "registration_number", ctx.mapping) || null,
        vat_number: getField(entry.row, "vat_number", ctx.mapping) || null,
        ...contactIdentityColumns(entry.row, ctx),
        // The known-wrong marks, PERSISTED. `is_verified` stays false while any of these stand.
        ...(dataQualityTags.length ? { tags: dataQualityTags, is_verified: false } : {}),
      })
      .select("id").single()

    if (contactError || !contact) {
      ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Failed to create contact: ${contactError?.message ?? "Unknown error"}`, severity: "error" })
      return
    }

    const normEmploymentType = normaliseEmploymentType(getField(entry.row, "employment_type", ctx.mapping))
    const normPreferredContact = normalisePreferredContact(getField(entry.row, "preferred_contact", ctx.mapping))

    const { data: created, error } = await ctx.supabase
      .from("tenants")
      .insert({
        org_id: ctx.orgId,
        contact_id: contact.id,
        employer_name: getField(entry.row, "employer_name", ctx.mapping) || null,
        occupation: getField(entry.row, "occupation", ctx.mapping) || null,
        ...(normEmploymentType ? { employment_type: normEmploymentType } : {}),
        ...(normPreferredContact ? { preferred_contact: normPreferredContact } : {}),
      })
      .select("id").single()

    if (error || !created) {
      ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Failed to create tenant: ${error?.message ?? "Unknown error"}`, severity: "error" })
      return
    }

    const tenantId = String(created.id)
    cacheTenant(ctx, email, tenantId)
    ctx.result.tenantsCreated++
    await insertNextOfKin(tenantId, entry.row, ctx.mapping, ctx.orgId, ctx.supabase)

    // Insert bank accounts if mapped (ADDENDUM_21B Fix 4)
    const holderName = `${firstName} ${lastName}`.trim() || (tenantCompany ?? "Unknown")
    await insertTenantBankAccounts(tenantId, holderName, entry.row, ctx)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Tenant error: ${msg}`, severity: "error" })
  }
}

/**
 * Identity + CPA-band columns on `contacts` that the importer could not previously take.
 *
 * The size bands are the valuable ones. `determineCpaApplicability` returns "indeterminate" for a juristic
 * tenant whose turnover and asset value are unknown — and an imported lease could NEVER be anything else,
 * because no import format carried them. It does now: if the agency's book has the bands, the juristic lease
 * lands DETERMINED and a statutory notice can cite (or correctly not cite) the CPA for it.
 *
 * `tpn_reference` / `tpn_entity_id` are the agency's own identifiers. They were already MAPPED (as
 * `__tpn_reference` / `__entity_id`) and then thrown away, while the columns to hold them existed all along.
 */
function contactIdentityColumns(row: Record<string, string>, ctx: ImportContext): Record<string, unknown> {
  const turnover = optionalBoolean(row, "turnover_under_2m", ctx)
  const assets = optionalBoolean(row, "asset_value_under_2m", ctx)

  const juristicRaw = getField(row, "juristic_type", ctx.mapping)
  const genderRaw = getField(row, "gender", ctx.mapping)

  return {
    title: getField(row, "title", ctx.mapping) || null,
    initials: getField(row, "initials", ctx.mapping) || null,
    gender: genderRaw ? classifyGender(genderRaw) : null,
    trading_as: getField(row, "trading_as", ctx.mapping) || null,
    juristic_type: juristicRaw ? classifyJuristicType(juristicRaw) : null,
    turnover_under_2m: turnover,
    asset_value_under_2m: assets,
    // Only a real capture stamps the date — both bands must be present, or the determination is not made.
    size_bands_captured_at: turnover !== null && assets !== null ? new Date().toISOString() : null,
    tpn_reference: getField(row, "tpn_reference", ctx.mapping) || null,
    tpn_entity_id: getField(row, "tpn_entity_id", ctx.mapping) || null,
  }
}

/**
 * KNOWN-WRONG, NOT REJECTED (Stéan ruling, 2026-07-12).
 *
 * A bad identity value must NOT cost the agency the row. A book of 5 000 leases cannot hang on two mistyped ID
 * digits — refusing here would make our strictness the agency's problem. So: import it, MARK it as known-wrong
 * on the contact, and let the agent correct it the moment they next touch that lease.
 *
 * The mark is PERSISTED on `contacts.tags`, not merely raised in the import report. An import warning is read
 * once and gone; a tag is queryable, so "every contact with a broken ID" becomes a worklist rather than a memory.
 */
function checkTenantIdentity(email: string, entry: UnitGroupEntry, ctx: ImportContext): string[] {
  const tags: string[] = []

  // This address is BOTH the dedup key AND where the tenant's mail goes. A malformed one silently merges two
  // people into one contact, or silently reaches nobody — and the importer used to accept anything at all.
  // An EMPTY email is not "malformed" — it is the relaxed email-less migration case, warned about at the call
  // site — so only the present-but-wrong address is flagged here.
  if (email && !looksLikeEmail(email)) {
    tags.push("email_malformed")
    flagForReview(ctx, entry.index, "email",
      `"${email}" does not look like an email address. It was imported and flagged on the tenant, but this ` +
      `address is how we RECOGNISE this tenant and how we CONTACT them — a malformed one can merge two people ` +
      `into one, or reach nobody at all.`)
  }

  // `validateSAIdNumber` has existed all along and the importer never called it: a 13-digit number failing its
  // own checksum was accepted as an identity, and would go on to a credit check and onto a lease document.
  // Flagged, never refused — a real book legitimately carries passports and permits too.
  const idForCheck = getField(entry.row, "id_number", ctx.mapping).replaceAll(/\s/g, "")
  if (/^\d{13}$/.test(idForCheck) && !validateSAIdNumber(idForCheck).valid) {
    tags.push("id_checksum_failed")
    flagForReview(ctx, entry.index, "id_number",
      "This looks like an SA ID number but fails its checksum, so at least one digit is wrong. The tenant WAS " +
      "imported and the ID marked unverified — correct it before it is used for a credit check or written onto " +
      "a lease document.")
  }

  return tags
}

async function insertNextOfKin(
  tenantId: string,
  row: Record<string, string>,
  mapping: ColumnMapping,
  orgId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const nokName = getField(row, "next_of_kin_name", mapping)
  const nokPhone = getField(row, "next_of_kin_phone", mapping)
  const nokRelationship = getField(row, "next_of_kin_relationship", mapping)
  const emergencyName = getField(row, "emergency_contact_name", mapping)
  const emergencyPhone = getField(row, "emergency_contact_phone", mapping)

  if (nokName) {
    const isAlsoEmergency = emergencyName === nokName
    await supabase.from("tenant_next_of_kin").insert({
      org_id: orgId,
      tenant_id: tenantId,
      full_name: nokName,
      relationship: nokRelationship || null,
      phone: nokPhone || null,
      is_emergency: isAlsoEmergency,
    })
  }

  if (emergencyName && emergencyName !== nokName) {
    await supabase.from("tenant_next_of_kin").insert({
      org_id: orgId,
      tenant_id: tenantId,
      full_name: emergencyName,
      phone: emergencyPhone || null,
      is_emergency: true,
    })
  }
}

async function insertSingleTenant(params: {
  firstName: string
  lastName: string
  email: string
  phone: string
  idNumber: string
  entry: UnitGroupEntry
  ctx: ImportContext
}): Promise<void> {
  const { firstName, lastName, email: rawEmail, phone, idNumber, entry, ctx } = params
  const email = primaryEmailKey(rawEmail)
  if (!email) return
  if (ctx.tenantIdCache.has(email)) return

  const { data: existing, error: existingError } = await ctx.supabase
    .from("contacts").select("id").eq("org_id", ctx.orgId).ilike("primary_email", email).order("created_at", { ascending: true }).limit(1).maybeSingle()
  assertLookupOk(existingError, "contact")

  if (existing) {
    // F-6a (walker Finding 2): the sibling bug — this cached a CONTACTS id as a tenant id. Route through the
    // same helper so a co-tenant on an existing contact resolves to a real tenants.id, not the contact id.
    const resolved = await tenantIdForExistingContact(String(existing.id), ctx)
    if (!resolved) {
      ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: "Failed to resolve tenant for existing contact (co-tenant)", severity: "warning" })
      return
    }
    ctx.tenantIdCache.set(email, resolved.tenantId)
    if (resolved.created) ctx.result.tenantsCreated++
    return
  }

  const { data: contact, error: contactError } = await ctx.supabase
    .from("contacts")
    .insert({
      org_id: ctx.orgId,
      entity_type: "individual",
      primary_role: "tenant",
      first_name: firstName || "Unknown",
      last_name: lastName || "Unknown",
      primary_email: email,
      primary_phone: phone || null,
      ...idNumberColumns(idNumber), // encrypted at rest + lookup hash (was raw, no hash)
    })
    .select("id").single()

  if (contactError || !contact) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Co-tenant contact error: ${contactError?.message}`, severity: "error" })
    return
  }

  const { data: created, error } = await ctx.supabase
    .from("tenants")
    .insert({
      org_id: ctx.orgId,
      contact_id: contact.id,
    })
    .select("id")
    .single()

  if (error || !created) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Co-tenant error: ${error?.message}`, severity: "error" })
  } else {
    ctx.tenantIdCache.set(email, String(created.id))
    ctx.result.tenantsCreated++
  }
}

// ── Bank account insertion ─────────────────────────────────────────────

/** The version of the notice the agent attests against. Bump when the wording in Step 2 changes — the
 *  consent_log row is only as meaningful as the text the agent actually agreed to. */
const BANK_IMPORT_NOTICE_VERSION = "1.0-agency-migration"

/**
 * Import a tenant's bank accounts (F-10, F-11).
 *
 * TWO rulings land here.
 *
 * 1. ENCRYPTED, not masked-only (F-11). The importer used to store a mask plus a one-way hash — so the number
 *    was UNRECOVERABLE, while the wizard told the agent it was "stored encrypted and used for deposit refund
 *    processing". A mask cannot process a refund. `bankAccountColumns` now writes the mask (for display), the
 *    AES-GCM ciphertext (in the `account_number_enc` column that has existed, unused, since migration 042) and
 *    the deterministic lookup hash, together.
 *
 * 2. ATTESTATION, not manufactured consent (F-10). It used to write `consent_given: true` unconditionally —
 *    a system asserting a consent record no one gave. The tenant is not in the room during a migration, and
 *    an operator's click-through is not the data subject's POPIA consent. What IS truthfully recordable is
 *    the AGENT's attestation that they hold that consent: an identified actor, a timestamp, a notice version.
 *    `consent_given` now reflects that attestation (FALSE if the agent did not attest), the attestation is
 *    written to `consent_log` as `bank_details_import`, and each account gets its own audit row — this is a
 *    payout-fraud-adjacent surface, and `contact_bank_accounts` already treats it as one.
 */
async function insertTenantBankAccounts(
  tenantId: string,
  accountHolderName: string,
  row: Record<string, string>,
  ctx: ImportContext
): Promise<void> {
  const accounts = [
    { accountField: "tenant_bank_account_1", bankNameField: "tenant_bank_name_1", branchField: "tenant_bank_branch_1", isPrimary: true },
    { accountField: "tenant_bank_account_2", bankNameField: "tenant_bank_name_2", branchField: "tenant_bank_branch_2", isPrimary: false },
  ]

  const attested = ctx.decisions.bankConsentAttested === true
  const attestedAt = new Date().toISOString()
  let importedForThisTenant = 0

  // FAIL LOUD, not silently. bankAccountColumns() throws if ENCRYPTION_KEY is unset, and that throw used to be
  // caught by the per-account try/catch below and downgraded to a WARNING — so on a misconfigured deploy the
  // bank details simply vanished and the agent was told the import worked. For a payout-adjacent surface that
  // must be an ERROR the agent cannot miss.
  if (!optionalEnv("ENCRYPTION_KEY")) {
    ctx.result.errors.push({
      rowIndex: -1, field: "tenant_bank_account_1", severity: "error",
      message: "Bank details were NOT imported: this deployment has no encryption key configured, and banking " +
        "details are never stored unencrypted. Contact support — everything else imported normally.",
    })
    return
  }

  for (const acc of accounts) {
    const rawAccount = getField(row, acc.accountField, ctx.mapping).trim()
    if (!rawAccount) continue

    const bankName = getField(row, acc.bankNameField, ctx.mapping).trim() || "Unknown"
    const branchCode = normaliseBranchCode(getField(row, acc.branchField, ctx.mapping).trim())

    try {
      const { data: created, error } = await ctx.supabase.from("tenant_bank_accounts").insert({
        org_id: ctx.orgId,
        tenant_id: tenantId,
        bank_name: bankName,
        account_holder: accountHolderName,
        ...bankAccountColumns(rawAccount),   // mask + AES-GCM ciphertext + lookup hash, together
        branch_code: branchCode,
        source: "import",
        imported_from: "tpn",
        is_primary: acc.isPrimary,
        // Reflects the AGENT'S ATTESTATION — never an assumed "true".
        consent_given: attested,
        consent_given_at: attested ? attestedAt : null,
      }).select("id").single()

      if (error || !created) {
        ctx.result.errors.push({
          rowIndex: -1, field: acc.accountField, severity: "warning",
          message: `Bank account insert failed: ${error?.message ?? "unknown error"}`,
        })
        continue
      }

      ctx.result.bankAccountsImported++
      importedForThisTenant++

      // Per-account audit. recordAudit's sanitiser drops account_number_enc/_hash and masks account_number,
      // so nothing sensitive reaches audit_log — but the fact of the write is now traceable.
      await recordAudit(ctx.supabase, {
        orgId: ctx.orgId, actorId: ctx.agentId, action: "INSERT",
        table: "tenant_bank_accounts", recordId: String(created.id),
        after: { source: "bulk_import", bank_name: bankName, is_primary: acc.isPrimary, consent_attested: attested },
      })
    } catch (err) {
      ctx.result.errors.push({
        rowIndex: -1, field: acc.accountField, severity: "warning",
        message: `Bank account error: ${err instanceof Error ? err.message : "Unknown error"}`,
      })
    }
  }

  if (importedForThisTenant === 0) return

  // The attestation itself — one row per tenant whose banking details were migrated. Recorded whether or not
  // the agent attested: a NEGATIVE record ("imported without an attestation of consent") is exactly as
  // important as a positive one, and is the thing a regulator would ask for.
  const { error: consentError } = await ctx.supabase.from("consent_log").insert({
    org_id: ctx.orgId,
    user_id: ctx.agentId,
    subject_email: getField(row, "email", ctx.mapping).toLowerCase() || null,
    consent_type: "bank_details_import",
    consent_given: attested,
    consent_version: BANK_IMPORT_NOTICE_VERSION,
    metadata: {
      tenant_id: tenantId,
      accounts_imported: importedForThisTenant,
      source: "bulk_import",
      import_session_id: ctx.importSessionId ?? null,
      // Says plainly what this row IS, so it can never be mistaken for the tenant's own consent.
      declaration: attested
        ? "Agency operator attested they hold the tenant's consent to migrate their banking details."
        : "Banking details migrated WITHOUT an attestation of tenant consent.",
    },
  })
  logIfError("importRunner consent_log (bank_details_import)", consentError)

  if (!attested) {
    ctx.result.errors.push({
      rowIndex: -1, field: "tenant_bank_account_1", severity: "warning",
      message: "Bank details were imported without confirming you hold the tenant's consent. They are recorded " +
        "as unconsented — obtain consent and update each account before using them.",
    })
  }
}

// ── Phase 4+5: Leases and history ──────────────────────────────────────

async function createLeasesAndHistory(
  unitGroups: Map<string, UnitGroup>,
  ctx: ImportContext
): Promise<void> {
  for (const [unitKey, group] of unitGroups) {
    const unitId = ctx.unitIdCache.get(unitKey)
    if (!unitId) continue
    const propertyId = ctx.unitPropertyCache.get(unitKey)
    if (!propertyId) continue   // the property/unit upsert already raised the error

    const activeRows = group.rows.filter((r) => r.role !== "previous")
    const previousRows = group.rows.filter((r) => r.role === "previous")

    if (activeRows.length > 0) {
      await processActiveLease(activeRows, unitId, propertyId, ctx)
    }

    for (const prev of previousRows) {
      await createTenancyHistory(prev, unitId, ctx)
    }
  }
}

/** An optional boolean cell: true / false / null-when-not-stated. Unlike the statutory booleans this never
 *  refuses a row — these columns are nullable and "we don't know" is representable. */
function optionalBoolean(row: Record<string, string>, field: string, ctx: ImportContext): boolean | null {
  const raw = getField(row, field, ctx.mapping)
  if (!raw) return null
  const c = classifyBoolean(raw)
  return c.ok ? c.value : null
}

/** Raise a row-level review item. The doctrine for every ambiguity at this boundary (money, dates, statutory
 *  classifications): the agent decides, the importer never guesses. Warnings ride out on the import report
 *  AND land in import_sessions.error_report, so the record survives the wizard session. */
function flagForReview(ctx: ImportContext, rowIndex: number, field: string, message: string): void {
  ctx.result.errors.push({ rowIndex, field, message, severity: "warning" })
}

/**
 * Resolve a money cell to integer cents — or flag it. Two F-8 rules:
 *   1. The UNIT comes from the source HEADER (normaliseMoneyCents): a Pleks re-export's `monthly_rent_cents`
 *      is already cents and must NOT be ×100'd again.
 *   2. A non-empty cell that will not parse is a REVIEW ITEM, never a silent null. Rent and deposit are the
 *      two numbers the entire ledger is built on; importing a lease with a quietly-blank rent is worse than
 *      refusing the row.
 */
function moneyCentsOrFlag(
  row: Record<string, string>,
  fieldName: string,
  rowIndex: number,
  ctx: ImportContext,
): number | null {
  const { value, column } = getFieldSource(row, fieldName, ctx.mapping)
  if (!value) return null

  const cents = normaliseMoneyCents(value, column)
  if (cents === null) {
    flagForReview(ctx, rowIndex, fieldName,
      `Could not read "${value}" (column "${column}") as an amount — imported blank. Set it manually.`)
  }
  return cents
}

/** F-9: an imported end_date past the holiday table's horizon, or an unreadable one. Both are silent
 *  statutory hazards — the first means this lease's CPA s14 notice date cannot be computed at all, the second
 *  means a fixed-term lease quietly became open-ended. Import either way; tell the agent either way. */
function checkLeaseEnd(
  row: Record<string, string>,
  normalisedEnd: string | null,
  rowIndex: number,
  ctx: ImportContext,
): void {
  const raw = getField(row, "lease_end", ctx.mapping)

  if (raw && !normalisedEnd) {
    flagForReview(ctx, rowIndex, "lease_end",
      `Could not read "${raw}" as a date — the lease was imported with NO end date (open-ended). Set it manually.`)
    return
  }

  // ONLY the upper bound. isWithinHolidayHorizon is two-sided and the table starts at 2025-01-01, so using it
  // here fired this warning on every HISTORICAL lease in a migrating book — where every clause of the message
  // is false (it is not past the table, its s14 date is moot, and extending the table forward never "resolves"
  // it), burying the forward-horizon warnings the check exists to raise.
  if (normalisedEnd && normalisedEnd > HOLIDAY_TABLE_COVERS_THROUGH) {
    flagForReview(ctx, rowIndex, "lease_end",
      `Lease ends ${normalisedEnd}, past the public-holiday table (covers to ${HOLIDAY_TABLE_COVERS_THROUGH}) — ` +
      `its CPA s14 renewal-notice date cannot be computed yet. Resolves automatically once the table is extended.`)
  }
}

/** A lease either builds completely or is REFUSED — see the NOT NULL discussion on buildLeaseData. */
type LeaseBuild = { ok: true; data: Record<string, unknown> } | { ok: false }

/** Refuse the row: a hard error the agent must fix in the source file, not a silent default. */
function refuse(ctx: ImportContext, rowIndex: number, field: string, message: string): { ok: false } {
  ctx.result.errors.push({ rowIndex, field, message, severity: "error" })
  return { ok: false }
}

/**
 * Build the lease insert, or REFUSE the row.
 *
 * Refusal (not "import it blank") is forced by the actual schema — `leases` requires start_date,
 * rent_amount_cents, property_id, tenant_id and unit_id (all NOT NULL, no defaults), and `lease_type` /
 * `escalation_type` are `NOT NULL DEFAULT 'residential'` / `DEFAULT 'fixed'`. So for the two statutory
 * classifications there is no such thing as "import it without a value": omitting the column hands the row
 * straight back to the default, which IS the guess F-7 exists to stop ("Retail" → residential → the
 * residential Demand-to-Vacate suite becomes available against a commercial lease). An unrecognised value
 * therefore refuses the lease and names the row, column and value. Import is idempotent (F-6), so the agent
 * fixes the cell and re-runs at no cost.
 *
 * `escalation_percent` is the same trap in reverse: NOT NULL DEFAULT 10.00, but the old code passed an
 * explicit `null` whenever the column was unmapped — and an explicit NULL OVERRIDES a default, so Postgres
 * rejected it. Conditionally spread it (like notice_period_days and the rest) so the default can apply.
 */
/** The NOT NULL, no-default columns. Either both resolve or the lease is refused with the real reason
 *  (rather than letting Postgres 23502 and surfacing as a generic "Failed to create lease"). */
function requiredLeaseFields(
  row: Record<string, string>, rowIndex: number, ctx: ImportContext,
): { startDate: string; rentCents: number } | null {
  const leaseStartRaw = getField(row, "lease_start", ctx.mapping)
  const startDate = leaseStartRaw ? normaliseDate(leaseStartRaw) : null
  if (!startDate) {
    refuse(ctx, rowIndex, "lease_start", leaseStartRaw
      ? `Could not read lease start "${leaseStartRaw}" as a date — a lease cannot be created without a start date.`
      : "A lease start date is required — map the lease start column and re-import.")
    return null
  }

  const rent = getFieldSource(row, "rent_amount_cents", ctx.mapping)
  const rentCents = rent.value ? normaliseMoneyCents(rent.value, rent.column) : null
  if (rentCents === null) {
    refuse(ctx, rowIndex, "rent_amount_cents", rent.value
      ? `Could not read rent "${rent.value}" (column "${rent.column}") as an amount — a lease cannot be created without rent.`
      : "A rent amount is required — map the rent column and re-import.")
    return null
  }

  return { startDate, rentCents }
}

/**
 * The four columns whose DB default IS the guess F-7 exists to stop. All are NOT NULL with a default, so
 * there is no "import it without a value" — every one of these silently resolves to the default when omitted:
 *   lease_type → 'residential' · escalation_type → 'fixed' · cpa_applies → true · is_fixed_term → true
 * Note the booleans matter MOST: the old normaliseBoolean returned false for anything it did not recognise,
 * so a book exporting Y/N (the commonest SA convention) imported cpa_applies=false on every lease — stripping
 * CPA s14 protection portfolio-wide — and is_fixed_term=false, making every fixed term open-ended.
 */
const CLASSIFIED_LEASE_COLUMNS: Array<{
  field: string
  classify: (raw: string) => Classification<unknown>
  label: string
  why: string
  unmappedNote: string
  /** A BLANK cell in this column is an honest "we do not know", not bad data — so it must not refuse the row.
   *  Only cpa_applies qualifies: unlike lease_type (whose absence silently becomes 'residential'), CPA has a
   *  representable unknown — `cpa_applies_at_signing = 'indeterminate'`, which fails SAFE and is flagged for
   *  the agent. An agency's book will very often leave this blank; refusing those leases would be absurd. */
  blankMeansUnknown?: boolean
}> = [
  {
    field: "lease_type", classify: classifyLeaseType, label: "lease type",
    why: "A commercial lease recorded as residential is subject to the wrong statutory notices.",
    unmappedNote: 'every lease will import as "residential" (the system default)',
  },
  {
    field: "escalation_type", classify: classifyEscalationType, label: "escalation type",
    why: 'It cannot be silently defaulted to "fixed" — that is a money term.',
    unmappedNote: 'every lease will import as "fixed"',
  },
  {
    field: "cpa_applies", classify: classifyBoolean, label: "CPA-applies flag",
    why: "Reading an unrecognised value as false would strip CPA s14 protection from the lease.",
    unmappedNote: "CPA applicability will be derived from each tenant (a natural person is always covered)",
    blankMeansUnknown: true,
  },
  {
    field: "is_fixed_term", classify: classifyBoolean, label: "fixed-term flag",
    why: "Reading an unrecognised value as false would turn a fixed-term lease open-ended.",
    unmappedNote: "every lease will import as fixed-term (the system default)",
  },
]

/**
 * NOT NULL DEFAULT columns that are NOT statutory classifications, but still silently GUESS when the file does
 * not carry them. They must not refuse a row (a book legitimately may not carry them — escalation usually
 * lives in the paper lease), but the agent has to be told the number was chosen by the system rather than by
 * their lease: `escalation_percent` DEFAULT 10.00 renders "your rent increases by 10%" in the escalation
 * notice, and `payment_due_day` DEFAULT '1' drives every arrears-aging and late-fee computation.
 */
const DEFAULTED_IF_UNMAPPED: Array<{ field: string; label: string; unmappedNote: string }> = [
  { field: "escalation_percent", label: "escalation percentage", unmappedNote: "every lease will import at 10% a year (the system default)" },
  { field: "payment_due_day", label: "payment due day", unmappedNote: "every lease will import as due on the 1st (the system default)" },
  // Found by field ablation (test/db/import-ablation.dbtest.ts): removing each of these silently handed the
  // column a DIFFERENT confident value. All three are statutory or money terms, and none of them said a word.
  { field: "notice_period_days", label: "notice period", unmappedNote: "every lease will import with a 20-day notice period (the system default) — this decides when a notice to vacate is valid" },
  { field: "deposit_return_days", label: "deposit return days", unmappedNote: "every lease will import with a 30-day deposit-return deadline (the system default)" },
  { field: "deposit_interest_to", label: "deposit-interest beneficiary", unmappedNote: "deposit interest will accrue to the TENANT on every lease (the system default) — RHA s5(3) makes this a money term" },
]

/**
 * Resolve the statutory classifications, or REFUSE the row.
 *
 * Three distinct cases, and the middle one is the one source-level review keeps missing:
 *   - column mapped, value recognised  → write it
 *   - column mapped, value BLANK or unrecognised → REFUSE. A blank cell is not "no opinion": the column is
 *     omitted, the DB default lands, and a book whose author only filled `Lease Type` where it "wasn't
 *     obvious" imports its commercial leases as residential. Blank is exactly the shape bad data takes.
 *   - column not mapped at all → the default applies uniformly; that is warned ONCE per import (runImport),
 *     not once per row, so a file with no lease-type column is still importable.
 */
function leaseClassifications(
  row: Record<string, string>, rowIndex: number, ctx: ImportContext,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}

  for (const col of CLASSIFIED_LEASE_COLUMNS) {
    const src = getFieldSource(row, col.field, ctx.mapping)
    if (!src.column) continue   // not mapped → uniform DB default, warned once at import level

    // A blank cell where blankness is MEANINGFUL: not bad data, just an unstated fact. Leave the column unset
    // and let the determination speak (cpaSnapshot).
    if (!src.value && col.blankMeansUnknown) continue

    const result = col.classify(src.value)
    if (!result.ok) {
      refuse(ctx, rowIndex, col.field, src.value
        ? `Unrecognised ${col.label} "${result.raw}" — the lease was NOT imported. ${col.why} Correct the cell and re-import.`
        : `Blank ${col.label} — the lease was NOT imported. ${col.why} Fill the cell and re-import.`)
      return null
    }
    out[col.field] = result.value
  }

  // "NO ESCALATION" → fixed @ 0%. The column cannot hold "none" (CHECK: fixed|cpi|prime_plus), but a lease
  // whose rent simply does not increase is ordinary, and we used to REFUSE every one of those rows.
  //
  // The zero must be FORCED, not merely allowed. `escalation_percent` is NOT NULL DEFAULT 10.00, so a "None"
  // row whose percentage cell is blank — which is exactly how a real book writes it — would otherwise import
  // as a 10% compounding annual increase. A lease that says "no increase" silently becoming a 10% increase is
  // the whole bug class in one line, and it is charged to a tenant every year for the life of the lease.
  if (out.escalation_type === "none") {
    const stated = out.escalation_percent
    if (typeof stated === "number" && stated !== 0) {
      // The file says BOTH "no escalation" AND a rate. One of the two cells is wrong and we cannot know which.
      refuse(ctx, rowIndex, "escalation_type",
        `This lease says its escalation is "none" but also gives a rate of ${stated}%. Those cannot both be ` +
        `true, and guessing which one the agency meant would either give a tenant an increase they never ` +
        `agreed to, or take one away from a landlord. The lease was NOT imported — correct one of the two cells.`)
      return null
    }
    out.escalation_type = "fixed"
    out.escalation_percent = 0
  }

  return out
}

/**
 * NOT NULL *DEFAULT* columns — OMIT them when absent so the default applies (an explicit null OVERRIDES the
 * default and Postgres rejects the row: exactly what `escalation_percent: null` did to every lease insert).
 * A present-but-unreadable value is flagged, never silently swallowed into the default.
 */
function optionalLeaseFields(
  row: Record<string, string>, rowIndex: number, ctx: ImportContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  // Locale-aware: parseFloat("7,5") is 7 — a 7.5% escalation quietly compounding at 7% for the lease's life.
  const escalationRaw = getField(row, "escalation_percent", ctx.mapping)
  if (escalationRaw) {
    const pct = normalisePercent(escalationRaw)
    if (pct === null) {
      flagForReview(ctx, rowIndex, "escalation_percent",
        `Could not read escalation "${escalationRaw}" as a percentage — the system default applies. Set it manually.`)
    } else out.escalation_percent = pct
  }

  // TEXT since migration 007: "1".."28" | "last_day" | "last_working_day". parseInt turned "last day" into
  // NaN → default '1', moving every rent due date (and every arrears computation) to the 1st.
  const dueDayRaw = getField(row, "payment_due_day", ctx.mapping)
  if (dueDayRaw) {
    const dueDay = normalisePaymentDueDay(dueDayRaw)
    if (dueDay === null) {
      flagForReview(ctx, rowIndex, "payment_due_day",
        `Could not read payment due day "${dueDayRaw}" — expected 1-28, "last day" or "last working day". ` +
        `The system default (the 1st) applies.`)
    } else out.payment_due_day = dueDay
  }

  // The rate this deposit was actually taken at, if the agency's export carries it. Locale-aware (an af-ZA
  // "7,5" through parseFloat is 7). Nothing beats the real rate — see migrateDeposit's ladder.
  const depositRateRaw = getField(row, "deposit_interest_rate_percent", ctx.mapping)
  if (depositRateRaw) {
    const pct = normalisePercent(depositRateRaw)
    if (pct === null) {
      flagForReview(ctx, rowIndex, "deposit_interest_rate_percent",
        `Could not read the deposit interest rate "${depositRateRaw}" as a percentage — the deposit was migrated ` +
        `without a rate, so interest is NOT accruing on it until you set one.`)
    } else out.deposit_interest_rate_percent = pct
  }

  const noticeDaysRaw = getField(row, "notice_period_days", ctx.mapping)
  if (noticeDaysRaw) {
    const noticeDays = Number.parseInt(noticeDaysRaw, 10)
    if (Number.isNaN(noticeDays)) {
      flagForReview(ctx, rowIndex, "notice_period_days",
        `Could not read notice period "${noticeDaysRaw}" as a number of days — the system default applies.`)
    } else out.notice_period_days = noticeDays
  }

  const escalationReviewRaw = getField(row, "escalation_review_date", ctx.mapping)
  const leaseConditions = getField(row, "lease_conditions", ctx.mapping)
  out.escalation_review_date = escalationReviewRaw ? normaliseDate(escalationReviewRaw) : null
  out.notes = leaseConditions || null

  return { ...out, ...leaseCoverageColumns(row, rowIndex, ctx) }
}

/**
 * Lease columns the importer could not previously take, though every one of them already existed.
 *
 * `payment_reference` is the rent reference every agency has — and the wizard used to offer `payment_method`,
 * a column that does not exist at all, while never offering the real one.
 *
 * `migrated` is a boolean that exists literally for this and was never set. It marks a lease that arrived from
 * another system rather than being originated in Pleks — exactly what a trust auditor, a support engineer, or
 * a "why does this lease have no signed document?" question needs to know.
 */
function leaseCoverageColumns(
  row: Record<string, string>, rowIndex: number, ctx: ImportContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    payment_reference: getField(row, "payment_reference", ctx.mapping) || null,
    migrated: true,
  }

  const returnDaysRaw = getField(row, "deposit_return_days", ctx.mapping)
  if (returnDaysRaw) {
    const days = Number.parseInt(returnDaysRaw, 10)
    if (!Number.isNaN(days)) out.deposit_return_days = days
  }

  const interestToRaw = getField(row, "deposit_interest_to", ctx.mapping)
  if (interestToRaw) {
    const to = classifyDepositInterestTo(interestToRaw)
    if (to) out.deposit_interest_to = to
    else {
      flagForReview(ctx, rowIndex, "deposit_interest_to",
        `Could not read "${interestToRaw}" — deposit interest accrues to the TENANT or the LANDLORD, and the ` +
        `system default (tenant) applies. RHA s5(3) makes that a money term; set it if the default is wrong.`)
    }
  }

  const arrearsMarginRaw = getField(row, "arrears_interest_margin_percent", ctx.mapping)
  if (arrearsMarginRaw) {
    const margin = normalisePercent(arrearsMarginRaw)
    if (margin === null) {
      flagForReview(ctx, rowIndex, "arrears_interest_margin_percent",
        `Could not read the arrears-interest margin "${arrearsMarginRaw}" as a percentage — not applied.`)
    } else {
      out.arrears_interest_margin_percent = margin
      out.arrears_interest_enabled = true   // a margin was supplied ⇒ the agency charges arrears interest
    }
  }

  return out
}

/**
 * The CPA applicability SNAPSHOT (F-16), and the ONE source of both CPA columns.
 *
 * `legalCitations.cpaGoverns` — the gate deciding whether a Demand-to-Vacate or final notice cites the CPA's
 * cure period — reads ONLY `cpa_applies_at_signing` (the 3-state column). The renewal CRON, which decides
 * whether an s14 notice is ever SENT, gates on `cpa_applies` (the boolean). Two halves of one statutory
 * pipeline, two different columns — so if they disagree per-lease, a lease can be CPA-governed for citations
 * and simultaneously INVISIBLE to the notice engine. Both are therefore derived HERE, from one determination.
 *
 * Routed through `determineCpaApplicability` — the same pure SSOT `markAsSigned()` uses, not a second opinion.
 * The importer knows the tenant's entity type and nothing else, so honestly:
 *   natural person → "yes" (CPA s5(2): a consumer, whatever the premises are)
 *   juristic       → "indeterminate" (turnover/asset bands are in no import format) → flagged for the agent,
 *                    exactly as a wizard-created juristic lease must be resolved before it can be activated.
 *
 * NOTE on migration 010's "commercial leases should never have cpa_applies = true": the CPA turns on the
 * CONSUMER, not the premises — a natural person letting a shop IS a consumer — so a blanket commercial ⇒ false
 * rule under-protects them. An earlier draft of this importer applied that rule and produced exactly the split
 * described above (boolean false, snapshot "yes" ⇒ no s14 notice ever fires, but the CPA cure period is cited
 * in the demand). Deriving both from the determination removes the contradiction: a juristic commercial tenant
 * still lands `false` (indeterminate ⇒ not "yes"), which is the case 010 was actually cleaning up.
 * → FLAGGED FOR CD: 010's invariant and CPA s5(2) disagree for a natural person on commercial premises.
 *
 * `explicitCpaApplies` — a `cpa_applies` column the agency actually mapped — always wins over the derivation.
 */
function cpaSnapshot(
  row: Record<string, string>, rowIndex: number, ctx: ImportContext,
  explicitCpaApplies: unknown,
): Record<string, unknown> {
  // Certain markers decide; suggestive ones FLAG. See classifyTenantEntity: a company read as a person asserts
  // the CPA for a juristic that may be over-threshold, and a person read as a company STRIPS the CPA from an
  // actual consumer. Both are statutory errors, so ambiguity is escalated to the agent rather than guessed.
  const { firstName, lastName, companyName } = resolveName(row, ctx.mapping)
  const entity = classifyTenantEntity(companyName, `${firstName} ${lastName}`.trim())

  if (entity === "ambiguous") {
    flagForReview(ctx, rowIndex, "cpa_applies",
      `We could not tell whether "${`${firstName} ${lastName}`.trim()}" is a person or a company, and that decides ` +
      `whether the CPA protects them. The lease was imported with the CPA undetermined — set the tenant type on ` +
      `the lease so statutory notices cite the right basis.`)
  }

  // THE SIZE BANDS. Until now these were hard-coded null, so a juristic lease could never be anything but
  // "indeterminate" — no import format carried them. If the agency's book DOES carry them, the determination
  // resolves properly and a statutory notice can cite (or correctly decline to cite) the CPA for that lease.
  // A `juristic_type` of "sole_proprietor" is decisive on its own: a sole proprietor is a NATURAL PERSON under
  // CPA s5(2), whatever the trading name says.
  const juristicRaw = getField(row, "juristic_type", ctx.mapping)
  const determination = determineCpaApplicability({
    tenant: {
      // "ambiguous" is passed through as a juristic-shaped value on purpose: determineCpaApplicability then
      // returns "indeterminate", which is the honest answer and the one that makes cpaGoverns fail SAFE (it
      // fires only on an explicit "yes"). The agent's flag above is what resolves it.
      entityType: entity === "individual" ? "individual" : "organisation",
      juristicType: juristicRaw ? classifyJuristicType(juristicRaw) : null,
      turnoverUnder2m: optionalBoolean(row, "turnover_under_2m", ctx),
      assetValueUnder2m: optionalBoolean(row, "asset_value_under_2m", ctx),
      sizeBandsCapturedAt: null,
    },
    lease: { isFranchiseAgreement: false },
  })

  // ── Who wins when the file and the determination disagree? It depends on WHO CAN KNOW.
  //
  // NATURAL PERSON — the STATUTE wins. CPA s5(2) makes a natural person a consumer, full stop. A file that says
  // "CPA: N" for one is simply wrong, and honouring it would strip a real protection. Flag it and apply the Act.
  //
  // JURISTIC (or ambiguous) — the AGENCY wins, if they said anything. Applicability turns on turnover and asset
  // bands, which no import format carries and Pleks therefore cannot compute. The agency KNOWS their tenant; a
  // deliberate "Y"/"N" in their book is a determination they have made and we have no basis to overrule. Silence
  // from them means genuinely unknown ⇒ "indeterminate", which fails SAFE (cpaGoverns fires only on "yes") and
  // is flagged for them to resolve.
  //
  // Whatever the answer, BOTH columns come from it. The renewal cron gates on the boolean and the citation
  // engine reads the snapshot; a per-lease disagreement makes a lease CPA-governed for demands and invisible to
  // the notice engine at the same time.
  const explicit = typeof explicitCpaApplies === "boolean" ? explicitCpaApplies : undefined

  let applies = determination.applies
  let category = determination.category
  let notes = determination.notes

  if (entity === "individual") {
    if (explicit === false) {
      flagForReview(ctx, rowIndex, "cpa_applies",
        `Your file says the CPA does NOT apply to ${`${firstName} ${lastName}`.trim()}, but the CPA applies to ` +
        `every natural person (s5(2)). The lease was imported WITH the CPA applying. Correct the file if this ` +
        `tenant is in fact a company.`)
    }
    // applies stays "yes" — the statute, not the spreadsheet.
  } else if (explicit !== undefined) {
    applies = explicit ? "yes" : "no"
    category = explicit ? "juristic_under_threshold" : "juristic_over_threshold"
    notes = "Juristic tenant: applicability taken from the agency's import file — the size bands it rests on are " +
      "not carried by any import format, so the agency's own determination stands."
  } else {
    flagForReview(ctx, rowIndex, "cpa_applies",
      "This tenant is a company, so whether the CPA applies depends on their turnover and asset value — which no " +
      "import format carries, and your file did not say. The lease was imported with the CPA undetermined, so a " +
      "statutory notice cannot cite it. Capture the size bands on the lease and it resolves.")
  }

  return {
    cpa_applies_at_signing: applies,
    cpa_determination_category: category,
    cpa_determination_notes: notes,
    cpa_determined_at: new Date().toISOString(),
    // ONE source for both. The boolean the cron gates on and the snapshot the citations read can never diverge.
    cpa_applies: applies === "yes",
  }
}

function buildLeaseData(
  row: Record<string, string>,
  unitId: string,
  propertyId: string,
  tenantId: string,
  rowIndex: number,
  isExpired: boolean,
  /** The agent ticked "Keep active" on a lease whose end date has ALREADY passed. */
  forcedActive: boolean,
  normalisedEnd: string | null,
  ctx: ImportContext
): LeaseBuild {
  const required = requiredLeaseFields(row, rowIndex, ctx)
  if (!required) return { ok: false }

  const classifications = leaseClassifications(row, rowIndex, ctx)
  if (!classifications) return { ok: false }

  // Advisory — import, but tell the agent (F-9 end date, F-8 deposit).
  checkLeaseEnd(row, normalisedEnd, rowIndex, ctx)
  const depositCents = moneyCentsOrFlag(row, "deposit_amount_cents", rowIndex, ctx)

  const data: Record<string, unknown> = {
    unit_id: unitId,
    property_id: propertyId,   // NOT NULL, and nothing derives it from unit_id — every insert failed without it
    org_id: ctx.orgId,
    tenant_id: tenantId,       // F-1: NOT NULL — set AT insert, not via a later UPDATE
    start_date: required.startDate,
    end_date: normalisedEnd,
    rent_amount_cents: required.rentCents,
    deposit_amount_cents: depositCents,
    status: isExpired ? "expired" : "active",
    // NO payment_method: `leases` has no such column. Writing it made PostgREST reject EVERY lease insert
    // ("Could not find the 'payment_method' column ... in the schema cache"). Its aliases are gone too.
    ...classifications,
    ...cpaSnapshot(row, rowIndex, ctx, classifications.cpa_applies),
    ...optionalLeaseFields(row, rowIndex, ctx),
  }

  // ── BOUNDS. "It parses" is a much weaker claim than "it could be true". A negative rent, a lease that ends
  // before it starts, a 500% escalation: all type-valid, all nonsense. INCOHERENT values refuse the row;
  // IMPLAUSIBLE ones import with a warning, because refusing them would block a legitimate edge case.
  const issues = checkLeasePlausibility({
    rentCents: required.rentCents,
    depositCents: depositCents,
    escalationPercent: typeof data.escalation_percent === "number" ? data.escalation_percent : null,
    arrearsMarginPercent: typeof data.arrears_interest_margin_percent === "number" ? data.arrears_interest_margin_percent : null,
    noticePeriodDays: typeof data.notice_period_days === "number" ? data.notice_period_days : null,
    depositReturnDays: typeof data.deposit_return_days === "number" ? data.deposit_return_days : null,
    startDate: required.startDate,
    endDate: normalisedEnd,
    todayISO: saTodayISO(),
  })
  let refused = false
  for (const issue of issues) {
    if (issue.severity === "error") {
      refuse(ctx, rowIndex, issue.field, issue.message)
      refused = true
    } else {
      flagForReview(ctx, rowIndex, issue.field, issue.message)
    }
  }
  if (refused) return { ok: false }

  // "Keep active" on a lease whose end date has already passed: the renewal was never captured in the old
  // system, so the date in the file is stale — we know the lease is LIVE and we do NOT know when it ends.
  //
  // Importing that as `status:'active', is_fixed_term:true, end_date:<past>` would be a state the platform
  // itself destroys: that is EXACTLY the selector of the nightly auto-convert cron
  // (is_fixed_term ∧ active ∧ end_date < today), which flips the lease to month-to-month and NULLs the end
  // date — silently reversing the agent's explicit decision overnight and losing the imported date with it.
  // So record what we actually know: a live, open-ended tenancy. It still bills (invoice-generate picks up
  // month_to_month), it is stable under the cron, and the agent is told to set a new end date if it renewed.
  if (forcedActive) {
    data.status = "month_to_month"
    data.is_fixed_term = false
    data.end_date = null
    flagForReview(ctx, rowIndex, "lease_end",
      `Kept active, but its end date (${normalisedEnd}) has passed — so it was imported as month-to-month ` +
      `rather than a fixed term that already ended. If the lease was renewed, set the new end date on it.`)
  }

  return { ok: true, data }
}

async function processActiveLease(
  activeRows: UnitGroupEntry[],
  unitId: string,
  propertyId: string,
  ctx: ImportContext
): Promise<void> {
  const firstActive = activeRows[0]
  if (!firstActive) return

  const { row, index } = firstActive
  const leaseEnd = getField(row, "lease_end", ctx.mapping)
  const normalisedEnd = leaseEnd ? normaliseDate(leaseEnd) : null
  // Compare DATES, not instants. `new Date("2026-07-12") < new Date()` parses the end date as UTC midnight and
  // compares it to local now, so a lease ending TODAY imports as "expired" and drops out of every active-lease
  // surface. Both sides are SA calendar days here.
  const endedInPast = normalisedEnd ? normalisedEnd < saTodayISO() : false
  // Step 3's "Keep active" checkbox: the agent has told us this lease is live despite the stale end date (a
  // renewal the old system never captured — extremely common in a migrated book).
  //
  // Checked across the WHOLE group, not just its first row. Step 3 renders a checkbox per FILE ROW and knows
  // nothing about unit grouping, so co-tenants on one unit appear as two identical-looking lines. Testing only
  // `firstActive.index` meant ticking the second line did nothing — and under the "skip" default the lease the
  // agent had just explicitly rescued was diverted to history and never created. One lease, one decision.
  const isExpired = endedInPast && !activeRows.some((r) => ctx.forceActiveRows.has(r.index))

  if (isExpired && ctx.decisions.expiredLeases === "import_active_only") {
    for (const ar of activeRows) {
      await createTenancyHistory(ar, unitId, ctx)
      // COUNT it. This branch was dead until the decisions contract was wired (F-13), and it withholds a lease
      // the agent can see in their file — so leaving it uncounted would report "28 leases created, 0 skipped"
      // on a 40-row book with 12 expired leases, telling the agent nothing about the 12.
      ctx.result.skipped++
    }
    return
  }

  try {
    // F-1: leases.tenant_id is NOT NULL, so it must be set AT insert. The primary tenant was created/resolved
    // in Phase 4 (upsertTenant) and cached by email; resolve it here. Without it the insert failed every time.
    // A joint-tenant cell ("a@x, b@x") is cached under the SPLIT emails, so key on the FIRST email (the
    // primary), not the whole cell — otherwise joint-tenant rows would cache-miss and create no lease.
    const primaryEmail = primaryEmailKey(getField(row, "email", ctx.mapping))
    const primaryTenantId = ctx.tenantIdCache.get(primaryEmail)
    if (!primaryTenantId) {
      ctx.result.errors.push({ rowIndex: index, field: "email", message: "Cannot create lease: no tenant was resolved for the primary email", severity: "error" })
      return
    }

    // F-6b: dedup — re-importing the same book must be a no-op, not a second (duplicate) active lease on the
    // unit. (Import inserts leases raw — no activateLeaseCascade / deposit posting — so a duplicate is a stray
    // row, not a trust double-post; still worth deduping.) A tenant has one active lease per unit; skip if it
    // exists. NOTE: SELECT-then-INSERT, no DB unique — a concurrent double-submit could still race (admin-only,
    // serial import → accepted; a partial-unique index would harden it but risks legitimate renewals).
    const { data: existingLease, error: existingLeaseError } = await ctx.supabase
      .from("leases").select("id").eq("org_id", ctx.orgId).eq("unit_id", unitId).eq("tenant_id", primaryTenantId).is("deleted_at", null).limit(1).maybeSingle()
    assertLookupOk(existingLeaseError, "existing-lease")
    if (existingLease) {
      ctx.result.skipped++
      return
    }

    const forcedActive = endedInPast && !isExpired   // ticked "Keep active" on an already-ended lease
    const built = buildLeaseData(row, unitId, propertyId, primaryTenantId, index, isExpired, forcedActive, normalisedEnd, ctx)
    if (!built.ok) return   // refused — buildLeaseData already raised the precise reason

    const { data: newLease, error } = await ctx.supabase
      .from("leases").insert(built.data).select("id").single()

    if (error || !newLease) {
      ctx.result.errors.push({ rowIndex: index, field: "lease_start", message: `Failed to create lease: ${error?.message ?? "Unknown error"}`, severity: "error" })
      return
    }

    const leaseId = String(newLease.id)
    ctx.result.leasesCreated++

    // A live lease means the unit is OCCUPIED. `units.status` defaults to 'vacant' and the importer never set
    // it, so a founding agent migrated 100 live leases and their dashboard showed 100 empty units — every
    // occupancy figure, vacancy report and "available to let" surface was wrong on day one.
    if (!isExpired) {
      await markUnitOccupied(unitId, ctx)
    }

    // The deposit the agency ALREADY HOLDS: resolve its interest rate (or hold), and carry the money into the
    // deposit/trust sub-ledger as an opening balance.
    await migrateDeposit(leaseId, unitId, propertyId, primaryTenantId, built.data, index, ctx)

    // Primary tenant_id is already set at insert; this loop now only surfaces the co-tenant "not linked" notice.
    for (const ar of activeRows) {
      await linkTenantToLease(ar, leaseId, ctx)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.result.errors.push({ rowIndex: index, field: "lease_start", message: `Lease error: ${msg}`, severity: "error" })
  }
}

/**
 * Migrate the deposit the agency ALREADY HOLDS (Stéan ruling, 2026-07-12).
 *
 * Two things, kept apart on purpose:
 *
 * THE RATE. RHA s5(3) interest cannot accrue without one, and the rate a deposit was taken at years ago by
 * another system is not something Pleks can infer. `accrueDepositInterest` would otherwise fall back to a
 * HARD-CODED 5% p.a. — inventing a rate and applying it to money held in trust for someone else. So:
 * the file's rate → else the agency's own CONFIGURED rate → else `not_set`, which HOLDS accrual until
 * an agent sets one. A held deposit accrues NOTHING; it does not accrue wrongly.
 *
 * THE LEDGER. The money is real, so it belongs in the deposit/trust sub-ledger as an OPENING BALANCE, or a
 * move-out reconciliation has no principal and the trust ledger under-states what the agency holds. But posting
 * into a trust ledger asserts a bank reality Pleks cannot see, so it is gated on the agent confirming the
 * agency actually holds these deposits. Not confirmed ⇒ the amount stays on the lease, NOTHING is posted, and
 * the lease is flagged. A trust ledger that silently disagrees with the bank is worse than an empty one.
 */
async function migrateDeposit(
  leaseId: string,
  unitId: string,
  propertyId: string,
  tenantId: string,
  leaseData: Record<string, unknown>,
  rowIndex: number,
  ctx: ImportContext,
): Promise<void> {
  const depositCents = typeof leaseData.deposit_amount_cents === "number" ? leaseData.deposit_amount_cents : 0
  if (depositCents <= 0) return

  // ── The rate ladder.
  const filePercent = typeof leaseData.deposit_interest_rate_percent === "number"
    ? leaseData.deposit_interest_rate_percent
    : null
  // The SAME scope the accrual engine will use. A lease has no deposit/trust account at import, so this is
  // (property → unit → org) — which is exactly why an ACCOUNT-scoped config would not reach it, and why the
  // flag below must say so instead of just "no rate".
  const rate = await resolveDepositRate(
    ctx.supabase, ctx.orgId,
    { propertyId, unitId, bankAccountId: null },
    filePercent,
  )

  // Only the rate itself is persisted. The HOLD is not: it is what the accrual engine concludes, live, when
  // no rate reaches the lease — so it self-heals the moment one does, instead of a stale stamp freezing it.
  if (rate.ratePercent !== null) {
    const { error: rateError } = await ctx.supabase
      .from("leases")
      .update({ deposit_interest_rate_percent: rate.ratePercent })
      .eq("id", leaseId).eq("org_id", ctx.orgId)
    logIfError("importRunner deposit rate", rateError)
  }

  if (rate.held) {
    // Two different problems, and telling them apart is the difference between one click and a support ticket.
    flagForReview(ctx, rowIndex, "deposit_amount_cents",
      rate.source === "config_unreachable"
        ? "Deposit interest is NOT accruing on this lease. You DO have a deposit-interest rate configured, but " +
          "it is scoped to a specific deposit/trust account and this lease is not linked to that account, so the " +
          "rate does not reach it. Link the lease to the account (or add a rate for the lease) and accrual starts."
        : "This deposit was migrated but no interest rate is known for it — not in the file, and your agency has " +
          "no deposit-interest rate configured. Interest is NOT accruing on it: we will not guess a rate on money " +
          "you hold in trust for someone else. Set a rate and accrual starts, backdated to the deposit.",
    )
  }

  // ── The ledger. Fail-closed: no attestation, no trust posting.
  if (ctx.decisions.depositsHeldAttested !== true) {
    flagForReview(ctx, rowIndex, "deposit_amount_cents",
      "The deposit amount is recorded on the lease, but nothing was posted to your deposit/trust ledger because " +
      "you did not confirm the agency holds these deposits. Until it is posted, a move-out reconciliation for " +
      "this lease has no principal.")
    return
  }

  const posted = await postOpeningDeposit(ctx.supabase, {
    orgId: ctx.orgId, leaseId, tenantId, propertyId, unitId,
    amountCents: depositCents, actorId: ctx.agentId,
  })

  if (posted.error) {
    ctx.result.errors.push({
      rowIndex, field: "deposit_amount_cents", severity: "error",
      message: `The lease imported, but its deposit could NOT be posted to the trust ledger: ${posted.error}. ` +
        `The money is not represented in the ledger — resolve this before relying on any trust balance.`,
    })
    return
  }
  if (posted.posted) ctx.result.depositsMigratedCents += depositCents
}

/**
 * Flip the unit to occupied and record the transition. Idempotent by construction: only reached when a lease
 * was actually CREATED (a re-run hits the dedup and returns before this), and the update is scoped
 * `.eq("status","vacant")` so a unit already occupied is not re-stamped and no duplicate history row appears.
 * Non-fatal — an occupancy blip must not fail an otherwise-good lease import.
 */
async function markUnitOccupied(unitId: string, ctx: ImportContext): Promise<void> {
  const { data: flipped, error } = await ctx.supabase
    .from("units")
    .update({ status: "occupied" })
    .eq("id", unitId).eq("org_id", ctx.orgId).eq("status", "vacant")
    .select("id")

  if (error) {
    ctx.result.errors.push({
      rowIndex: -1, field: "unit_number", severity: "warning",
      message: `Lease imported, but the unit could not be marked occupied: ${error.message}`,
    })
    return
  }

  if (!flipped?.length) {
    // Zero rows matched. Either the unit is ALREADY occupied (a re-run — correct no-op) or it sits in a status
    // the scoped update deliberately will not overwrite. Those are very different, and treating them the same
    // means a live lease can be imported onto a unit that still reads as "under maintenance", with every
    // occupancy and vacancy report quietly wrong and no signal anywhere.
    const { data: unit, error: unitError } = await ctx.supabase
      .from("units").select("status, unit_number").eq("id", unitId).eq("org_id", ctx.orgId).maybeSingle()
    logIfError("importRunner unit status re-read", unitError)
    if (unit && unit.status !== "occupied") {
      ctx.result.errors.push({
        rowIndex: -1, field: "unit_number", severity: "warning",
        message: `Unit ${unit.unit_number} has a live imported lease but is marked "${unit.status}" — it was left ` +
          `as-is rather than overwritten. Set it to occupied if that status is stale.`,
      })
    }
    return
  }

  const { error: historyError } = await ctx.supabase.from("unit_status_history").insert({
    unit_id: unitId,
    org_id: ctx.orgId,
    from_status: "vacant",
    to_status: "occupied",
    changed_by: ctx.agentId,
    reason: "Imported with an active lease",
  })
  logIfError("importRunner unit_status_history", historyError)
}

async function linkTenantToLease(
  entry: UnitGroupEntry,
  leaseId: string,
  ctx: ImportContext
): Promise<void> {
  const email = primaryEmailKey(getField(entry.row, "email", ctx.mapping))
  const tenantId = ctx.tenantIdCache.get(email)
  if (!tenantId) return

  if (entry.role === "co_tenant") {
    // Co-tenant support not yet in schema — log for manual review
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Co-tenant "${email}" noted but not linked (no co-tenant table yet)`, severity: "warning" })
    return
  }

  // Set tenant_id on the lease for primary tenant
  const { error } = await ctx.supabase
    .from("leases")
    .update({ tenant_id: tenantId })
    .eq("id", leaseId)
    .eq("org_id", ctx.orgId) // org-scope guard (caller-ID census)

  if (error) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Failed to link tenant to lease: ${error.message}`, severity: "warning" })
  }
}

async function resolveTenantIdForHistory(
  email: string,
  entry: UnitGroupEntry,
  ctx: ImportContext,
): Promise<string | undefined> {
  // 1. Check cache
  const cached = ctx.tenantIdCache.get(email)
  if (cached) return cached

  // 2. Try existing contact → tenant
  const { data: existingContact, error: existingContactError } = await ctx.supabase
    .from("contacts").select("id").eq("org_id", ctx.orgId).ilike("primary_email", email).order("created_at", { ascending: true }).limit(1).maybeSingle()
  assertLookupOk(existingContactError, "previous-tenant contact")

  if (existingContact) {
    const { data: existingTenant, error: existingTenantError } = await ctx.supabase
      .from("tenants").select("id").eq("contact_id", existingContact.id).limit(1).maybeSingle()
    assertLookupOk(existingTenantError, "previous-tenant")
    if (existingTenant) {
      const tenantId = String(existingTenant.id)
      ctx.tenantIdCache.set(email, tenantId)
      return tenantId
    }
  }

  // 3. Create contact + tenant for the previous tenant
  const { firstName, lastName, companyName: prevTenantCompany } = resolveName(entry.row, ctx.mapping)
  const prevDisplay = prevTenantCompany || `${firstName} ${lastName}`.trim()
  const { data: contact, error: contactError } = await ctx.supabase
    .from("contacts")
    .insert({
      org_id: ctx.orgId,
      entity_type: resolveEntityType(prevTenantCompany, prevDisplay),
      primary_role: "tenant",
      first_name: firstName || (prevTenantCompany ? null : "Unknown"),
      last_name: lastName || (prevTenantCompany ? null : "Unknown"),
      company_name: prevTenantCompany || null,
      primary_email: email,
    })
    .select("id").single()
  if (contactError) console.error("importRunner prev-tenant contacts insert failed:", contactError.message)

  if (contact) {
    const { data: tenant, error: tenantError } = await ctx.supabase
      .from("tenants")
      .insert({ org_id: ctx.orgId, contact_id: contact.id })
      .select("id").single()
    if (tenantError) console.error("importRunner prev-tenant tenants insert failed:", tenantError.message)

    if (tenant) {
      const tenantId = String(tenant.id)
      ctx.tenantIdCache.set(email, tenantId)
      return tenantId
    }
  }

  return undefined
}

async function createTenancyHistory(
  entry: UnitGroupEntry,
  unitId: string,
  ctx: ImportContext
): Promise<void> {
  const email = primaryEmailKey(getField(entry.row, "email", ctx.mapping))
  const leaseStart = getField(entry.row, "lease_start", ctx.mapping)
  const leaseEnd = getField(entry.row, "lease_end", ctx.mapping)

  // Need a tenant_id — check cache or resolve/create
  const tenantId = email ? await resolveTenantIdForHistory(email, entry, ctx) : undefined

  if (!tenantId) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "tenancy_history", message: "Cannot create history without tenant email", severity: "warning" })
    return
  }

  // tenancy_history.move_in_date is NOT NULL (002_contacts.sql §) — a null was rejected by Postgres and the
  // reason was swallowed into a generic "Failed to create history". Refuse with the real reason instead.
  const moveIn = leaseStart ? normaliseDate(leaseStart) : null
  if (!moveIn) {
    ctx.result.errors.push({
      rowIndex: entry.index, field: "tenancy_history", severity: "warning",
      message: leaseStart
        ? `Could not read lease start "${leaseStart}" as a date — no tenancy history recorded for this row.`
        : "No lease start date — a tenancy-history entry requires a move-in date.",
    })
    return
  }

  // F-6b: dedup — re-importing the same book must not double the history rows.
  const { data: existingHist, error: existingHistError } = await ctx.supabase
    .from("tenancy_history").select("id")
    .eq("org_id", ctx.orgId).eq("unit_id", unitId).eq("tenant_id", tenantId).eq("move_in_date", moveIn)
    .limit(1).maybeSingle()
  assertLookupOk(existingHistError, "lease-history")
  if (existingHist) {
    ctx.result.skipped++
    return
  }

  try {
    const { error } = await ctx.supabase.from("tenancy_history").insert({
      unit_id: unitId,
      org_id: ctx.orgId,
      tenant_id: tenantId,
      move_in_date: moveIn,
      move_out_date: leaseEnd ? normaliseDate(leaseEnd) : null,
      status: "ended",
    })

    if (error) {
      ctx.result.errors.push({ rowIndex: entry.index, field: "tenancy_history", message: `Failed to create history: ${error.message}`, severity: "warning" })
    } else {
      ctx.result.historyCreated++
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.result.errors.push({ rowIndex: entry.index, field: "tenancy_history", message: `History error: ${msg}`, severity: "warning" })
  }
}

// ── Phase 6: Notes ─────────────────────────────────────────────────────

function reportUnmappedColumns(
  entry: UnitGroupEntry,
  ctx: ImportContext
): void {
  const cols = Object.keys(getExtraColumns(entry.row, ctx.mapping))
  if (cols.length === 0) return
  // There is no generic `notes` table (only lease_notes); the old insert 42703'd into a swallowing
  // try/catch, silently dropping these. Surface the unmapped columns in the import report instead (PR-3)
  // rather than building a generic notes table for an import nicety.
  ctx.result.errors.push({
    rowIndex: entry.index,
    field: "notes",
    message: `Unmapped columns not imported: ${cols.join(", ")}`,
    severity: "warning",
  })
}

async function writeNotes(
  unitGroups: Map<string, UnitGroup>,
  ctx: ImportContext
): Promise<void> {
  for (const [unitKey, group] of unitGroups) {
    const unitId = ctx.unitIdCache.get(unitKey)
    if (!unitId) continue

    for (const entry of group.rows) {
      reportUnmappedColumns(entry, ctx)
    }
  }
}

// ── Phase 7: Audit log ────────────────────────────────────────────────

async function writeAuditLog(ctx: ImportContext): Promise<void> {
  try {
    await recordAudit(ctx.supabase, {
      orgId: ctx.orgId, actorId: ctx.agentId, action: "INSERT",
      table: "import_sessions", recordId: ctx.importSessionId ?? ctx.orgId,
      after: {
        action: "bulk_import",
        properties_created: ctx.result.propertiesCreated,
        units_created: ctx.result.unitsCreated,
        tenants_created: ctx.result.tenantsCreated,
        leases_created: ctx.result.leasesCreated,
        history_created: ctx.result.historyCreated,
        notes_created: ctx.result.notesCreated,
        skipped: ctx.result.skipped,
        error_count: ctx.result.errors.length,
      },
    })
  } catch {
    ctx.result.errors.push({ rowIndex: -1, field: "audit", message: "Failed to write audit log entry", severity: "warning" })
  }
}

// ── Entity routing ──────────────────────────────────────────────────────

/** A row PLUS its index in the file the agent uploaded. Routing splits the rows into four subsets, and every
 *  consumer used to index its own subset — so a landlord on file line 87 was reported as "Row 1", and the
 *  refusal doctrine ("correct that row and re-import") pointed the agent at the wrong line. The original index
 *  travels with the row now, and it is also the key `decisions.skipRows` / `conflicts` are stated in. */
interface IndexedRow {
  row: Record<string, string>
  index: number
}

interface RoutedRows {
  tenantRows: IndexedRow[]
  vendorRows: IndexedRow[]
  landlordRows: IndexedRow[]
  agentRows: IndexedRow[]
  /** Rows whose `__entity_type` we do not recognise. NOT a silent drop — the caller reports every one. */
  unknownRows: Array<IndexedRow & { entityType: string }>
}

function routeRowsByType(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): RoutedRows {
  const result: RoutedRows = {
    tenantRows: [],
    vendorRows: [],
    landlordRows: [],
    agentRows: [],
    unknownRows: [],
  }

  for (const [index, row] of rows.entries()) {
    // Keep the agency's own text. When we report a row we could not route, we quote what THEY wrote — echoing a
    // lowercased version back at them makes the message read like it is about some other file.
    const original = getField(row, "__entity_type", mapping).trim()
    const raw = original.toLowerCase()
    // Strip individual/company qualifiers so "contractor individual", "landlord company" etc. all normalize cleanly
    const entityType = raw
      .replace(/\b(individual|person|company|organisation|organization|cc|pty\s*ltd|ltd|inc)\b/g, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    switch (entityType) {
      case "tenant":
      case "lessee":
      case "huurder":
      case "":
        result.tenantRows.push({ row, index })
        break
      case "vendor":
      case "supplier":
      case "contractor":
      case "managing scheme":
      case "body corporate":
      case "utility":
      case "utilities":
      case "municipality":
      case "munisipaliteit":
      case "munisipalite":
        result.vendorRows.push({ row, index })
        break
      case "landlord":
      case "owner":
      case "verhuurder":
      case "eienaar":
        result.landlordRows.push({ row, index })
        break
      case "agent":
      case "principal agent":
      case "administrator":
        result.agentRows.push({ row, index })
        break
      default:
        // An entity type we do not recognise. This USED TO `break` with the comment "skip silently" — the row
        // was not imported, not counted in `skipped`, and not reported. A whole class of an agency's book
        // ("Guarantor", "Beneficiary", a typo'd "Tennant") could vanish between the file and the database with
        // nothing anywhere saying so. Route it to `unknownRows` and let the caller SAY it was not imported.
        result.unknownRows.push({ row, index, entityType: original })
        break
    }
  }

  return result
}

// ── Vendor / Contractor import ─────────────────────────────────────────

function resolveVendorName(
  row: Record<string, string>,
  mapping: ColumnMapping
): { displayName: string; companyName: string; firstName: string; lastName: string } {
  const legalName = getField(row, "legal_name", mapping) || getField(row, "__split_name", mapping)
  const tradingName = getField(row, "trading_name", mapping)
  const companyName = getField(row, "company_name", mapping) || tradingName || legalName
  const firstName = getField(row, "first_name", mapping)
  const lastName = getField(row, "last_name", mapping)

  const displayName = tradingName || legalName || companyName || `${firstName} ${lastName}`.trim()
  if (firstName || lastName) {
    return { displayName, companyName, firstName, lastName }
  }
  if (legalName) {
    const split = splitFullName(legalName)
    return { displayName, companyName, firstName: split.firstName, lastName: split.lastName }
  }
  return { displayName: displayName || "Unknown", companyName, firstName: "", lastName: "" }
}

function buildBankNotes(
  row: Record<string, string>,
  mapping: ColumnMapping
): string | null {
  const parts: string[] = []
  const account = getField(row, "__bank_account", mapping)
  const bankName = getField(row, "__bank_name", mapping)
  const branch = getField(row, "__bank_branch", mapping)

  if (bankName) parts.push(`Bank: ${bankName}`)
  if (branch) parts.push(`Branch: ${normaliseBranchCode(branch) ?? branch}`)
  if (account) parts.push(`Account: ${account}`)

  return parts.length > 0 ? parts.join("\n") : null
}

function resolveSupplierType(row: Record<string, string>, mapping: ColumnMapping): string {
  const normalizedType = getField(row, "__entity_type", mapping)
    .toLowerCase().trim()
    .replace(/\b(individual|person|company|organisation|organization|cc|pty\s*ltd|ltd|inc)\b/g, "")
    .replace(/[-_]/g, " ").replace(/\s+/g, " ").trim()

  if (normalizedType === "managing scheme" || normalizedType === "body corporate") {
    return "managing_scheme"
  }
  if (
    normalizedType === "utility" ||
    normalizedType === "utilities" ||
    normalizedType === "municipality" ||
    normalizedType === "munisipaliteit" ||
    normalizedType === "munisipalite"
  ) {
    return "utility"
  }
  return "contractor"
}


async function importVendors(
  vendorRows: IndexedRow[],
  ctx: ImportContext
): Promise<void> {
  const seenEmails = new Set<string>()

  for (const entry of vendorRows) {
    const { row, index: i } = entry   // i is the FILE row, not the position in this subset

    const email = getField(row, "email", ctx.mapping).toLowerCase()
    const { displayName, companyName, firstName, lastName } = resolveVendorName(row, ctx.mapping)

    // Dedup by email within this batch
    if (email && seenEmails.has(email)) continue
    if (email) seenEmails.add(email)

    try {
      // IDENTITY FIRST. The supplier path matched on email, then on an EXACT company name — so "ABC Plumbing"
      // and "ABC Plumbing (Pty) Ltd" were two suppliers, and a supplier whose email changed was a third. The
      // CIPC registration number was being written and never matched on.
      const candidate = identityCandidate(row, ctx)
      const outcome = await resolveIdentity("contractor", { ...candidate, companyName: companyName || displayName || null }, i, ctx)
      if (outcome.kind === "hold") continue
      if (outcome.kind === "link") {
        ctx.result.skipped++
        continue
      }

      const phone = getField(row, "phone", ctx.mapping) || null
      const regNumber = getField(row, "registration_number", ctx.mapping) || null
      const vatNumber = getField(row, "vat_number", ctx.mapping) || null
      const notes = buildBankNotes(row, ctx.mapping)

      const { data: contact, error: contactError } = await ctx.supabase
        .from("contacts")
        .insert({
          org_id: ctx.orgId,
          entity_type: resolveEntityType(companyName, displayName),
          primary_role: "contractor",
          first_name: firstName || null,
          last_name: lastName || null,
          company_name: displayName || null,
          primary_email: email || null,
          primary_phone: phone,
          registration_number: regNumber,
          vat_number: vatNumber,
          notes,
        })
        .select("id").single()

      if (contactError || !contact) {
        ctx.result.errors.push({
          rowIndex: i,
          field: "email",
          message: `Failed to create contractor contact: ${contactError?.message}`,
          severity: "error",
        })
        continue
      }

      const supplierType = resolveSupplierType(row, ctx.mapping)

      const { error } = await ctx.supabase.from("contractors").insert({
        org_id: ctx.orgId,
        contact_id: contact.id,
        supplier_type: supplierType,
        is_active: true,
      })

      if (error) {
        ctx.result.errors.push({
          rowIndex: i,
          field: "email",
          message: `Failed to create contractor: ${error.message}`,
          severity: "error",
        })
      } else {
        ctx.result.contractorsCreated++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      ctx.result.errors.push({
        rowIndex: i,
        field: "email",
        message: `Contractor error: ${msg}`,
        severity: "error",
      })
    }
  }
}

// ── Landlord import ────────────────────────────────────────────────────

async function importLandlords(
  landlordRows: IndexedRow[],
  ctx: ImportContext
): Promise<void> {
  for (const entry of landlordRows) {
    const { row, index: i } = entry   // i is the FILE row, not the position in this subset

    const email = getField(row, "email", ctx.mapping).toLowerCase()
    if (!email) {
      // RELAXED for MIGRATION (mirrors the tenant path): import an email-less landlord with a loud WARNING
      // rather than dropping them — a dropped landlord means their payouts group under "unknown". resolveIdentity
      // dedups on SA ID / CIPC / VAT / name+phone, so no email is needed to avoid a double payout identity.
      flagForReview(ctx, i, "email",
        "No email on this landlord. Imported without one — add it before any payout or statement communication.")
    }

    try {
      // NO dedup against properties.owner_email any more — it was SELF-DEFEATING. Phase 2 of this very import
      // writes owner_email onto every property, so by the time we got here the check always matched and the
      // landlord was skipped: in the ordinary case, where a book gives both the property's owner and a landlord
      // row for that owner, NO LANDLORD ENTITY WAS EVER CREATED. The owner existed only as denormalised text on
      // the property — so their ledger was empty, and Finance grouped the money owed to them under "unknown".
      // A property carrying an owner's email is a reason to LINK, not a reason to skip. That happens in
      // linkLandlordsToProperties below.

      // IDENTITY FIRST, email second. The old check was email-ONLY, so `john@acme.co.za` on the old system and
      // `j.smith@acme.co.za` on the rent roll became two landlords — two PAYOUT IDENTITIES, for one man. The
      // SA ID hash and the CIPC number were being written on every import and used for matching never.
      const outcome = await resolveIdentity("landlord", identityCandidate(row, ctx), i, ctx)
      if (outcome.kind === "hold") continue            // NOT imported; named in the report; the agent decides
      if (outcome.kind === "link") {
        ctx.result.skipped++                           // already ours — nothing to create
        continue
      }

      const { firstName, lastName, companyName: landlordCompany } = resolveName(row, ctx.mapping)
      const landlordDisplay = landlordCompany || `${firstName} ${lastName}`.trim()
      const phone = getField(row, "phone", ctx.mapping) || null
      const idNumber = getField(row, "id_number", ctx.mapping) || null
      const vatNumber = getField(row, "vat_number", ctx.mapping) || null
      // The CIPC number was READ from the file and then SILENTLY DROPPED — the landlord insert stored the VAT
      // number and not the registration number. So a company landlord's canonical identity was thrown away, and
      // (until this) could never be matched on. Found by the identity test, not by review.
      const regNumber = getField(row, "registration_number", ctx.mapping) || null

      const { data: contact, error: contactError } = await ctx.supabase
        .from("contacts")
        .insert({
          org_id: ctx.orgId,
          entity_type: resolveEntityType(landlordCompany, landlordDisplay),
          primary_role: "landlord",
          first_name: firstName || (landlordCompany ? null : "Unknown"),
          last_name: lastName || (landlordCompany ? null : "Unknown"),
          company_name: landlordCompany || null,
          primary_email: email || null,
          primary_phone: phone,
          ...idNumberColumns(idNumber), // encrypted at rest + lookup hash (was raw, no hash)
          registration_number: regNumber,
          vat_number: vatNumber,
        })
        .select("id").single()

      if (contactError || !contact) {
        ctx.result.errors.push({
          rowIndex: i,
          field: "email",
          message: `Failed to create landlord contact: ${contactError?.message ?? "Unknown error"}`,
          severity: "error",
        })
        continue
      }

      const { data: created, error } = await ctx.supabase
        .from("landlords")
        .insert({
          org_id: ctx.orgId,
          contact_id: contact.id,
          created_by: ctx.agentId,
        })
        .select("id")
        .single()

      if (error || !created) {
        ctx.result.errors.push({
          rowIndex: i,
          field: "email",
          message: `Failed to create landlord: ${error?.message ?? "Unknown error"}`,
          severity: "error",
        })
      } else {
        const fullName = `${firstName} ${lastName}`.trim() || "Unknown"
        ctx.result.landlordsImported++
        ctx.result.pendingLandlordLinks.push({
          pendingLandlordId: String(created.id),
          name: fullName,
          email,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      ctx.result.errors.push({
        rowIndex: i,
        field: "email",
        message: `Landlord error: ${msg}`,
        severity: "error",
      })
    }
  }
}

// ── Landlord ↔ property linking ─────────────────────────────────────────

/**
 * Attach every imported property to a real landlord ENTITY, and cascade that to its leases.
 *
 * The importer wrote the owner onto the property as denormalised text (owner_name / owner_email /
 * owner_bank_*) and, separately, created `landlords` rows — and never linked the two. The consequences were
 * quiet and financial:
 *   - `ownerLedger` finds a landlord's properties via `properties.landlord_id`. Null ⇒ the landlord's ledger
 *     page is EMPTY, however many properties they own.
 *   - `financeHub` groups owner balances by `owner_statements.landlord_id` with `?? "unknown"` ⇒ money owed to
 *     owners collapses into a single unnamed "unknown" bucket.
 *   - Owner statements still generate and email (they key off `owner_email`), so nothing looks broken — which
 *     is exactly why nobody would notice.
 *
 * The join key was in the file all along: `properties.owner_email` IS the landlord's contact email. So we
 * match on it, and CREATE the landlord from the property's own owner columns when the book never gave a
 * separate landlord row (the common shape: a tenant list with owner_name/owner_email columns and no landlord
 * rows at all — which previously produced no landlord entity anywhere).
 *
 * `pendingLandlordLinks` now carries only the GENUINE misses — a landlord whose email matched no property —
 * which is what that list was always supposed to mean. It used to list every landlord, linked or not, and tell
 * the agent to go and link 200 of them by hand.
 */
async function linkLandlordsToProperties(ctx: ImportContext): Promise<void> {
  const { data: properties, error } = await ctx.supabase
    .from("properties")
    .select("id, name, owner_email, owner_name, owner_phone")
    .eq("org_id", ctx.orgId)
    .is("landlord_id", null)
    .not("owner_email", "is", null)
  assertLookupOk(error, "properties for landlord linking")

  for (const property of properties ?? []) {
    const email = String(property.owner_email ?? "").toLowerCase().trim()
    if (!email) continue

    const landlordId = await findOrCreateLandlord(email, property, ctx)
    if (!landlordId) continue

    const { error: linkError } = await ctx.supabase
      .from("properties").update({ landlord_id: landlordId })
      .eq("id", property.id).eq("org_id", ctx.orgId)
    if (linkError) {
      ctx.result.errors.push({
        rowIndex: -1, field: "owner_email", severity: "warning",
        message: `Could not link "${property.name}" to its owner: ${linkError.message}`,
      })
      continue
    }
    ctx.result.landlordsLinked++

    // Cascade to the leases on that property. leases.landlord_id is nullable and read by the lease detail,
    // maintenance-approval and finance surfaces; a lease that knows its owner does not have to go via the
    // property to find them.
    const { error: leaseError } = await ctx.supabase
      .from("leases").update({ landlord_id: landlordId })
      .eq("property_id", property.id).eq("org_id", ctx.orgId).is("landlord_id", null)
    logIfError("importRunner cascade landlord to leases", leaseError)
  }

  // Whatever is left in pendingLandlordLinks is a landlord who matched NO property — a real miss the agent
  // must resolve, not a chore we made for them.
  const { data: linked, error: linkedError } = await ctx.supabase
    .from("properties").select("owner_email").eq("org_id", ctx.orgId).not("landlord_id", "is", null)
  logIfError("importRunner linked-owner read-back", linkedError)

  // Fail CONSERVATIVE: if we cannot read back what got linked, leave the list alone. Treating an errored read
  // as "nothing is linked" would be harmless; treating it as "everything is linked" would silently drop a real
  // miss. Showing the agent a chore they have already done is the cheaper mistake.
  if (linkedError) return

  const linkedEmails = new Set((linked ?? []).map((p) => String(p.owner_email ?? "").toLowerCase()))
  ctx.result.pendingLandlordLinks = ctx.result.pendingLandlordLinks.filter(
    (l) => !linkedEmails.has(l.email.toLowerCase()),
  )
}

/** An existing landlord for this email, or one created from the property's own owner columns. */
async function findOrCreateLandlord(
  email: string,
  property: { name?: unknown; owner_name?: unknown; owner_phone?: unknown },
  ctx: ImportContext,
): Promise<string | null> {
  const { data: existing, error: existingError } = await ctx.supabase
    .from("landlord_view").select("id").eq("org_id", ctx.orgId).ilike("email", email).limit(1).maybeSingle()
  assertLookupOk(existingError, "landlord")
  if (existing) return String(existing.id)

  // The book never gave a landlord row for this owner — but the property told us who they are. Create them.
  const ownerName = String(property.owner_name ?? "").trim()
  const { firstName, lastName } = splitFullName(ownerName)

  const { data: contact, error: contactError } = await ctx.supabase
    .from("contacts")
    .insert({
      org_id: ctx.orgId,
      entity_type: resolveEntityType("", ownerName),
      primary_role: "landlord",
      first_name: firstName || (ownerName ? null : "Unknown"),
      last_name: lastName || (ownerName ? null : "Unknown"),
      company_name: resolveEntityType("", ownerName) === "organisation" ? ownerName : null,
      primary_email: email,
      primary_phone: String(property.owner_phone ?? "") || null,
    })
    .select("id").single()
  if (contactError || !contact) {
    ctx.result.errors.push({
      rowIndex: -1, field: "owner_email", severity: "warning",
      message: `Could not create the owner of "${String(property.name ?? "")}": ${contactError?.message ?? "unknown error"}`,
    })
    return null
  }

  const { data: landlord, error: landlordError } = await ctx.supabase
    .from("landlords")
    .insert({ org_id: ctx.orgId, contact_id: contact.id, created_by: ctx.agentId })
    .select("id").single()
  if (landlordError || !landlord) {
    ctx.result.errors.push({
      rowIndex: -1, field: "owner_email", severity: "warning",
      message: `Could not create the owner of "${String(property.name ?? "")}": ${landlordError?.message ?? "unknown error"}`,
    })
    return null
  }

  ctx.result.landlordsImported++
  return String(landlord.id)
}

// ── Agent import ───────────────────────────────────────────────────────

function mapAgentRole(entityType: string): string {
  const normalized = entityType.toLowerCase().trim()
  if (normalized === "principal agent") return "property_manager"
  if (normalized === "administrator") return "owner"
  return "agent"
}

async function importAgents(
  agentRows: IndexedRow[],
  ctx: ImportContext
): Promise<void> {
  for (const entry of agentRows) {
    const { row, index: i } = entry   // i is the FILE row, not the position in this subset

    const email = getField(row, "email", ctx.mapping).toLowerCase()
    if (!email) {
      ctx.result.errors.push({
        rowIndex: i,
        field: "email",
        message: "Agent email is required",
        severity: "error",
      })
      continue
    }

    try {
      // Dedup: check if already an org member
      const { data: existingMember, error: existingMemberError } = await ctx.supabase
        .rpc("get_org_member_by_email", { p_org_id: ctx.orgId, p_email: email })
      assertLookupOk(existingMemberError, "org member (by email)")

      if (existingMember && (Array.isArray(existingMember) ? existingMember.length > 0 : true)) {
        ctx.result.skipped++
        continue
      }

      // Dedup: check existing invites
      const { data: existingInvite, error: existingInviteError } = await ctx.supabase
        .from("invites")
        .select("id")
        .eq("org_id", ctx.orgId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle()
      assertLookupOk(existingInviteError, "existing invite")

      if (existingInvite) {
        ctx.result.skipped++
        continue
      }

      const { firstName, lastName } = resolveName(row, ctx.mapping)
      const phone = getField(row, "phone", ctx.mapping) || null
      const entityType = getField(row, "__entity_type", ctx.mapping)
      const role = mapAgentRole(entityType)

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const { error } = await ctx.supabase.from("invites").insert({
        org_id: ctx.orgId,
        email,
        role,
        invited_by: ctx.agentId,
        expires_at: expiresAt.toISOString(),
        metadata: {
          full_name: `${firstName} ${lastName}`.trim() || null,
          phone: phone || null,
        },
      })

      if (error) {
        ctx.result.errors.push({
          rowIndex: i,
          field: "email",
          message: `Failed to create agent invite: ${error.message}`,
          severity: "error",
        })
      } else {
        ctx.result.agentInvitesSent++
        ctx.result.agentInvites.push({ email, role })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      ctx.result.errors.push({
        rowIndex: i,
        field: "email",
        message: `Agent invite error: ${msg}`,
        severity: "error",
      })
    }
  }
}

// ── Main Import Runner ─────────────────────────────────────────────────

/**
 * FORMULA CELLS — neutralised at getField, but the agency must be TOLD: we changed what they gave us, and a
 * silent correction is indistinguishable from a silent corruption.
 */
function reportFormulaCells(rows: Record<string, string>[], ctx: ImportContext): void {
  // ONE MESSAGE PER COLUMN, not per cell. A book with a formula-shaped column would otherwise emit a warning
  // for every row — two thousand near-identical messages that bury the findings the agency actually needs to
  // act on. A report nobody can read is not a report. Count them, name the column, cite the first row.
  const formulaCells = new Map<string, { count: number; firstRow: number }>()
  for (const [index, row] of rows.entries()) {
    for (const [column, value] of Object.entries(row)) {
      if (typeof value !== "string" || !looksLikeFormula(value)) continue
      const seen = formulaCells.get(column)
      if (seen) seen.count++
      else formulaCells.set(column, { count: 1, firstRow: index })
    }
  }
  for (const [column, { count, firstRow }] of formulaCells) {
    ctx.result.errors.push({
      rowIndex: firstRow,
      field: column,
      severity: "warning",
      message:
        `${count === 1 ? "A cell" : `${count} cells`} in the "${column}" column ` +
        `${count === 1 ? "begins" : "begin"} with a formula character, so a spreadsheet would EXECUTE ` +
        `${count === 1 ? "it" : "them"} rather than read ${count === 1 ? "it" : "them"} as text. ` +
        `${count === 1 ? "It was" : "They were"} imported with that character removed. Check the original ` +
        `cells — a formula in a name or address field is almost always a copy-paste accident, and occasionally ` +
        `it is not.`,
    })
  }
}

/**
 * DUPLICATE HEADERS — papaparse keys each row by header name, so two columns called "Email" collapse into ONE
 * key and the second silently overwrites the first. By the time the runner holds `rows` the duplicate is gone,
 * so the raw header row travels with the decisions: this is the only place the evidence still exists.
 */
function reportDuplicateHeaders(decisions: ImportDecisions, ctx: ImportContext): void {
  // DUPLICATE HEADERS. papaparse keys each row by header name, so two columns called "Email" become ONE key —
  // the second overwrites the first, and the loss is invisible by the time we hold `rows`. This is the only
  // place it can be caught, and it must be, because the agency cannot tell which of their two columns we kept.
  const seenHeaders = new Set<string>()
  for (const header of decisions.fileHeaders ?? []) {
    const key = header.trim().toLowerCase()
    if (!key) continue
    if (seenHeaders.has(key)) {
      ctx.result.errors.push({
        rowIndex: -1,
        field: header,
        severity: "warning",
        message:
          `The file has more than one column called "${header}". Only ONE of them was imported — the other's ` +
          `data was dropped, and we cannot tell you which was which. Rename or remove the duplicate and re-run.`,
      })
    }
    seenHeaders.add(key)
  }
}

/**
 * Is this row someone we ALREADY HAVE? The one place that decides, so no entity path can drift from the rule.
 *
 *   LINK    an exact deterministic key matched (SA ID hash, CIPC registration, VAT) — or an exact email.
 *   CREATE  nothing came close. A different person.
 *   HOLD    the grey band. We think it MIGHT be them, and we will not guess.
 *
 * CONFIDENCE IS A TRIAGE SIGNAL, NEVER A MERGE AUTHORITY. The band decides prompt-vs-create; it does not decide
 * merge-vs-not. Merge authority comes only from an exact key or the agent's explicit confirmation — so not even
 * a 0.94 match fuses two identities.
 *
 * Because the failure modes are ASYMMETRIC. Merging two people who are actually different fuses their ledgers
 * and attributes one person's data to another: near-irreversible, and a POPIA breach. A duplicate is annoying
 * and reversible — an agent merges it in a minute. So the band fails toward the REVERSIBLE error.
 *
 * A HELD ROW IS NOT IMPORTED, and it is named in the report. (A held tenant holds their LEASE too: a lease
 * silently attached to the WRONG person is far worse than one that waits for a question. Strictness costs the
 * ROW, never the BOOK — the agency keeps the other ninety-nine.)
 */
type IdentityOutcome =
  | { kind: "link"; contactId: string }
  | { kind: "create" }
  | { kind: "hold" }

async function resolveIdentity(
  role: string,
  candidate: IdentityCandidate,
  rowIndex: number,
  ctx: ImportContext,
): Promise<IdentityOutcome> {
  // The agent has already answered this one — honour it. That answer IS the merge authority.
  const decided = ctx.decisions.identityDecisions?.[rowIndex]
  if (decided) {
    return decided.action === "link" ? { kind: "link", contactId: decided.contactId } : { kind: "create" }
  }

  const match = await matchExistingContact(ctx.supabase, ctx.orgId, role, candidate)
  if (!match) return { kind: "create" }
  if (match.confidence >= AUTO_LINK) return { kind: "link", contactId: match.contactId }

  // The grey band. Hold the row, and tell them precisely what it costs and what to do about it.
  const incomingName =
    candidate.companyName?.trim() ||
    [candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim() ||
    "(unnamed)"

  ctx.result.identityHolds.push({
    rowIndex,
    role,
    incoming: { name: incomingName, email: candidate.email },
    match: {
      contactId: match.contactId,
      name: match.existing.name,
      email: match.existing.email,
      confidence: match.confidence,
      basis: match.basis,
    },
  })
  ctx.result.errors.push({
    rowIndex,
    field: "identity",
    severity: "error",          // NOT a warning: the row did not import. The agent must know, and must act.
    message: describeMatch(match, { name: incomingName, email: candidate.email }),
  })
  ctx.result.skipped++
  return { kind: "hold" }
}

/** Build the identity candidate from a row. The SA ID travels as its HASH — never the number, never the ciphertext. */
function identityCandidate(row: Record<string, string>, ctx: ImportContext): IdentityCandidate {
  const rawId = getField(row, "id_number", ctx.mapping).replaceAll(/\s/g, "")
  const { firstName, lastName } = resolveName(row, ctx.mapping)
  return {
    email: getField(row, "email", ctx.mapping).toLowerCase() || null,
    phone: getField(row, "phone", ctx.mapping) || null,
    // hashIdNumber is the deterministic dedup key. The ciphertext has a random IV and is NOT a key — matching
    // on it would match nothing, every time, which is a fail-open wearing a lock.
    idNumberHash: rawId ? hashIdNumber(rawId) : null,
    registrationNumber: getField(row, "registration_number", ctx.mapping) || null,
    vatNumber: getField(row, "vat_number", ctx.mapping) || null,
    firstName: firstName || null,
    lastName: lastName || null,
    companyName: getField(row, "company_name", ctx.mapping) || null,
  }
}

/**
 * PROJECT a file row into the lease row it WOULD become — without a database.
 *
 * `buildLeaseData` never touches Postgres: it is mapping, classification, normalisation, the CPA determination
 * and the plausibility gate, and nothing else. That is where almost every real import bug this arc found
 * actually lived — the header aliases, the af-ZA money, the day/month swap, the Excel serial, the escalation
 * that was silently 10%, the formula lead, the negative rent.
 *
 * Which means those bugs can be hunted 446× faster than through the database (measured: 456 ms/book with
 * Postgres, 1.02 ms/book without). This export is what lets the fuzz tier run five thousand books in seconds.
 *
 * ⚠ AND IT PROVES STRICTLY LESS, which must be said out loud every time the number gets quoted. A pure pass
 * cannot see a phantom column, a NOT NULL, a CHECK, a trigger, or a unique index — it would never have caught
 * `payment_method` (a column that does not exist), or `escalation_percent: null` hitting NOT NULL, or the trust
 * ledger doubling. Those live at the WRITE boundary and nowhere else. So: 100 000 pure cases are not 100 000
 * real ones, and anyone who reads "100 000 passed" as "the importer is proven" has been handed false proof —
 * the exact failure this whole arc is named after. The DB tier stays, small and chosen, and proves what only it
 * can.
 */
export interface RowProjection {
  /** The lease row that would be INSERTED, or null when the importer refused it. */
  lease: Record<string, unknown> | null
  errors: ImportError[]
}

export function projectLeaseRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
  rowIndex = 0,
): RowProjection {
  const result = emptyImportResult()
  const ctx: ImportContext = {
    mapping,
    decisions: { conflicts: [], expiredLeases: "import_active_only", skipRows: [], forceActiveRows: [] },
    orgId: "00000000-0000-0000-0000-000000000000",
    agentId: "00000000-0000-0000-0000-000000000000",
    importSessionId: undefined,
    // NEVER dereferenced on this path — buildLeaseData does not touch Postgres. If that ever changes, this
    // throws LOUDLY rather than silently projecting a lie.
    supabase: new Proxy({} as SupabaseClient, {
      get() { throw new Error("projectLeaseRow: the lease projection must stay PURE — it touched the database") },
    }),
    result,
    forceActiveRows: new Set(),
    unitIdCache: new Map(),
    unitPropertyCache: new Map(),
    tenantIdCache: new Map(),
  }

  // The end date is normalised the same way the real path does it — a projection that parsed dates differently
  // from the runner would be testing a fiction.
  const normalisedEnd = normaliseDate(getField(row, "lease_end", mapping)) ?? null
  const isExpired = normalisedEnd !== null && normalisedEnd < saTodayISO()

  const build = buildLeaseData(
    row,
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000003",
    rowIndex,
    isExpired,
    false,
    normalisedEnd,
    ctx,
  )
  return {
    lease: build.ok ? (build.data as Record<string, unknown>) : null,
    errors: result.errors,
  }
}

/** A zero result, for the pure projection. */
function emptyImportResult(): ImportResult {
  return {
    propertiesCreated: 0, unitsCreated: 0, tenantsCreated: 0, leasesCreated: 0, historyCreated: 0,
    notesCreated: 0, contractorsCreated: 0, landlordsImported: 0, landlordsLinked: 0, agentInvitesSent: 0,
    bankAccountsImported: 0, depositsMigratedCents: 0, skipped: 0, errors: [],
    pendingLandlordLinks: [], agentInvites: [], identityHolds: [],
  }
}

export async function runImport(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  decisions: ImportDecisions,
  orgId: string,
  agentId: string,
  importSessionId: string | undefined,
  supabase: SupabaseClient
): Promise<ImportResult> {
  const ctx: ImportContext = {
    mapping,
    decisions,
    orgId,
    agentId,
    importSessionId,
    supabase,
    result: {
      propertiesCreated: 0,
      unitsCreated: 0,
      tenantsCreated: 0,
      leasesCreated: 0,
      historyCreated: 0,
      notesCreated: 0,
      contractorsCreated: 0,
      landlordsImported: 0,
      landlordsLinked: 0,
      agentInvitesSent: 0,
      bankAccountsImported: 0,
      depositsMigratedCents: 0,
      skipped: 0,
      errors: [],
      pendingLandlordLinks: [],
      agentInvites: [],
      identityHolds: [],
    },
    forceActiveRows: new Set(decisions.forceActiveRows ?? []),
    unitIdCache: new Map(),
    unitPropertyCache: new Map(),
    tenantIdCache: new Map(),
  }

  // F-8: two source columns landing on ONE Pleks field means getField silently takes the first and drops the
  // rest — e.g. "Rent" and "Monthly Rent" both mapped to rent_amount_cents, with key order deciding the money.
  // The wizard warns at mapping time; record it on the import report too, so the decision survives the session
  // even if the agent clicked through.
  for (const collision of detectMappingCollisions(mapping)) {
    const [winner, ...dropped] = collision.columns
    ctx.result.errors.push({
      rowIndex: -1,
      field: collision.field,
      message: `Columns ${collision.columns.map((c) => `"${c}"`).join(", ")} all map to "${collision.field}" — ` +
        `only "${winner}" was imported; ${dropped.map((c) => `"${c}"`).join(", ")} ${dropped.length > 1 ? "were" : "was"} ignored.`,
      severity: "warning",
    })
  }

  // A classification column that is not mapped AT ALL means its NOT NULL DEFAULT applies to every lease in the
  // book — a uniform guess rather than a per-row one. Say so ONCE, up front, instead of refusing every row
  // (which would make a file with no lease-type column unimportable) or saying nothing (the status quo).
  const mappedFields = new Set(Object.values(mapping).map((m) => m.field))
  if (mappedFields.has("lease_start")) {   // i.e. leases are actually being imported
    for (const col of [...CLASSIFIED_LEASE_COLUMNS, ...DEFAULTED_IF_UNMAPPED]) {
      if (mappedFields.has(col.field)) continue
      ctx.result.errors.push({
        rowIndex: -1, field: col.field, severity: "warning",
        message: `No ${col.label} column mapped — ${col.unmappedNote}. Map it if that is not true of every lease.`,
      })
    }
  }

  // FORMULA CELLS. Neutralised at getField (the value never reaches the database executable), but the agency
  // must be TOLD — we changed what they gave us, and a silent correction is indistinguishable from a silent
  // corruption. Reported per row so they can look at the source cell themselves.
  reportFormulaCells(rows, ctx)
  reportDuplicateHeaders(decisions, ctx)

  // Route rows by entity type
  const routed = routeRowsByType(rows, mapping)

  // REPORT-HONESTY: imported + flagged + skipped must account for every row in the file. A row we cannot route
  // is a row we did not import, and the agency must be told which one and why — not left to discover it missing.
  for (const unknown of routed.unknownRows) {
    ctx.result.skipped++
    ctx.result.errors.push({
      rowIndex: unknown.index,
      field: "__entity_type",
      message:
        `This row is a "${unknown.entityType}", which is not a record type Pleks imports (tenant, landlord, ` +
        `supplier or agent). It was NOT imported. If it is one of those under another name, map its type ` +
        `column accordingly and re-run; otherwise it is safe to leave out.`,
      severity: "warning",
    })
  }

  // Build conflict lookup (applies to tenant rows only)
  const skipSet = new Set<number>(decisions.skipRows ?? [])
  const conflictMap = new Map<number, ConflictDecision>()
  for (const cd of decisions.conflicts ?? []) {
    for (const idx of cd.rowIndices) {
      conflictMap.set(idx, cd)
    }
  }

  // Phase 1: Group tenant rows by unit
  const unitGroups = buildUnitGroups(routed.tenantRows, ctx, conflictMap, skipSet)

  // Phase 2: Upsert properties + units
  await upsertPropertiesAndUnits(unitGroups, ctx)

  // Phase 3: Create tenants
  await createTenants(unitGroups, ctx)

  // Phase 4+5: Create leases and tenancy history
  await createLeasesAndHistory(unitGroups, ctx)

  // Phase 6: Write notes
  await writeNotes(unitGroups, ctx)

  // Phase 7: Audit log
  await writeAuditLog(ctx)

  // Phase 8: Import vendors / contractors
  await importVendors(routed.vendorRows, ctx)

  // Phase 9: Import landlords
  await importLandlords(routed.landlordRows, ctx)

  // Phase 9b: attach every property to a real landlord entity, and cascade to its leases.
  await linkLandlordsToProperties(ctx)

  // Phase 10: Import agents
  await importAgents(routed.agentRows, ctx)

  return ctx.result
}
