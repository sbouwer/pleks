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
  classifyLeaseType, classifyEscalationType, classifyBoolean, classifyProvince,
  SA_PROVINCES, type Classification,
} from "./classify"
import { detectMappingCollisions } from "./columnMapper"
import { normaliseBranchCode, hashBankAccount, maskBankAccount } from "./bankImport"
import { idNumberColumns } from "@/lib/crypto/idNumber"
import { HOLIDAY_TABLE_COVERS_THROUGH, saTodayISO } from "@/lib/dates"

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
  agentInvitesSent: number
  bankAccountsImported: number
  skipped: number
  errors: ImportError[]
  pendingLandlordLinks: Array<{ pendingLandlordId: string; name: string; email: string }>
  agentInvites: Array<{ email: string; role: string }>
}

export type ConflictResolution = "skip" | "co_tenant" | "previous" | "duplicate"

export interface ConflictDecision {
  unitKey: string
  rowIndices: number[]
  resolution: ConflictResolution
  /** For "previous": which row indices are the previous tenants */
  previousIndices?: number[]
}

export type ExpiredDecision = "import_active_only" | "import_all" | "import_as_history"

export interface ImportDecisions {
  conflicts: ConflictDecision[]
  expiredLeases: ExpiredDecision
  /** Row indices to skip entirely */
  skipRows: number[]
  /** Step 3's "Keep active" per-row exception: import this lease as LIVE even though its end date has passed.
   *  The wizard has always offered this checkbox; the runner had no concept of it, so it did nothing. */
  forceActiveRows: number[]
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

function getField(
  row: Record<string, string>,
  fieldName: string,
  mapping: ColumnMapping
): string {
  // The mapping key IS the original column name from the file
  for (const [columnName, mapped] of Object.entries(mapping)) {
    if (mapped.field === fieldName) {
      return (row[columnName] ?? row[mapped.column] ?? "").trim()
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
  if (existingError) console.error("importRunner properties lookup failed:", existingError.message)

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
  if (existingError) console.error("importRunner units lookup failed:", existingError.message)

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
  if (etErr) console.error("importRunner existing-contact tenant lookup failed:", etErr.message)
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
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: "Tenant email is required", severity: "error" })
    return
  }
  if (ctx.tenantIdCache.has(email)) return

  try {
    const { data: existing, error: existingError } = await ctx.supabase
      .from("contacts").select("id").eq("org_id", ctx.orgId).ilike("primary_email", email).order("created_at", { ascending: true }).limit(1).maybeSingle()
    if (existingError) console.error("importRunner contacts lookup failed:", existingError.message)

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
      ctx.tenantIdCache.set(email, resolved.tenantId)
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
        primary_email: email,
        primary_phone: getField(entry.row, "phone", ctx.mapping) || null,
        ...idNumberColumns(getField(entry.row, "id_number", ctx.mapping)), // encrypted at rest + lookup hash
        ...(normIdType ? { id_type: normIdType } : {}),
        date_of_birth: dobRaw ? normaliseDate(dobRaw) : null,
        nationality: getField(entry.row, "nationality", ctx.mapping) || null,
        registration_number: getField(entry.row, "registration_number", ctx.mapping) || null,
        vat_number: getField(entry.row, "vat_number", ctx.mapping) || null,
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
    ctx.tenantIdCache.set(email, tenantId)
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
  if (existingError) console.error("importRunner contacts lookup failed:", existingError.message)

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

async function insertTenantBankAccounts(
  tenantId: string,
  accountHolderName: string,
  row: Record<string, string>,
  ctx: ImportContext
): Promise<void> {
  const accounts = [
    {
      accountField: "tenant_bank_account_1",
      bankNameField: "tenant_bank_name_1",
      branchField: "tenant_bank_branch_1",
      isPrimary: true,
    },
    {
      accountField: "tenant_bank_account_2",
      bankNameField: "tenant_bank_name_2",
      branchField: "tenant_bank_branch_2",
      isPrimary: false,
    },
  ]

  for (const acc of accounts) {
    const rawAccount = getField(row, acc.accountField, ctx.mapping).trim()
    if (!rawAccount) continue

    const bankName = getField(row, acc.bankNameField, ctx.mapping).trim() || "Unknown"
    const rawBranch = getField(row, acc.branchField, ctx.mapping).trim()
    const branchCode = normaliseBranchCode(rawBranch)

    try {
      const { error } = await ctx.supabase.from("tenant_bank_accounts").insert({
        org_id: ctx.orgId,
        tenant_id: tenantId,
        bank_name: bankName,
        account_holder: accountHolderName,
        account_number: maskBankAccount(rawAccount),
        account_number_hash: hashBankAccount(rawAccount),
        branch_code: branchCode,
        source: "import",
        imported_from: "tpn",
        is_primary: acc.isPrimary,
        consent_given: true,
        consent_given_at: new Date().toISOString(),
      })

      if (error) {
        ctx.result.errors.push({
          rowIndex: -1,
          field: acc.accountField,
          message: `Bank account insert failed: ${error.message}`,
          severity: "warning",
        })
      } else {
        ctx.result.bankAccountsImported++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      ctx.result.errors.push({
        rowIndex: -1,
        field: acc.accountField,
        message: `Bank account error: ${msg}`,
        severity: "warning",
      })
    }
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
    unmappedNote: "every lease will import with the CPA applying (the system default)",
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

    const result = col.classify(src.value)
    if (!result.ok) {
      refuse(ctx, rowIndex, col.field, src.value
        ? `Unrecognised ${col.label} "${result.raw}" — the lease was NOT imported. ${col.why} Correct the cell and re-import.`
        : `Blank ${col.label} — the lease was NOT imported. ${col.why} Fill the cell and re-import.`)
      return null
    }
    out[col.field] = result.value
  }

  // A commercial lease must never carry cpa_applies = true — migration 010 states the invariant and had to
  // run a one-off UPDATE to restore it. Nothing in the DB enforces it, so the importer must.
  //
  // This only became reachable BECAUSE the lease_type fix works: previously every lease imported as
  // "residential" (the old guess), so the cpa_applies DEFAULT true was never wrong in a way anyone saw. Now
  // that "Retail"/"Office" correctly land as commercial, an unmapped CPA column would let DEFAULT true stand
  // and the calendar would raise CPA s14 auto-renewal deadlines against leases the CPA does not govern.
  // A CPA column in the file still wins — this only fills the gap the default would otherwise guess into.
  if (out.lease_type === "commercial" && out.cpa_applies === undefined) {
    out.cpa_applies = false
    flagForReview(ctx, rowIndex, "cpa_applies",
      "Commercial lease with no CPA column — imported with the CPA NOT applying (the system's commercial-lease " +
      "invariant). If this tenant is a natural person or a small juristic, set it on the lease.")
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

  return out
}

function buildLeaseData(
  row: Record<string, string>,
  unitId: string,
  propertyId: string,
  tenantId: string,
  rowIndex: number,
  isExpired: boolean,
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

  return {
    ok: true,
    data: {
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
      ...optionalLeaseFields(row, rowIndex, ctx),
    },
  }
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
  // Step 3's "Keep active" checkbox: the agent has told us this lease is live despite the stale end date
  // (a renewal that was never captured in the old system — extremely common in a migrated book).
  const isExpired = endedInPast && !ctx.forceActiveRows.has(index)

  if (isExpired && ctx.decisions.expiredLeases === "import_active_only") {
    for (const ar of activeRows) {
      await createTenancyHistory(ar, unitId, ctx)
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
    if (existingLeaseError) console.error("importRunner existing-lease lookup failed:", existingLeaseError.message)
    if (existingLease) {
      ctx.result.skipped++
      return
    }

    const built = buildLeaseData(row, unitId, propertyId, primaryTenantId, index, isExpired, normalisedEnd, ctx)
    if (!built.ok) return   // refused — buildLeaseData already raised the precise reason

    const { data: newLease, error } = await ctx.supabase
      .from("leases").insert(built.data).select("id").single()

    if (error || !newLease) {
      ctx.result.errors.push({ rowIndex: index, field: "lease_start", message: `Failed to create lease: ${error?.message ?? "Unknown error"}`, severity: "error" })
      return
    }

    const leaseId = String(newLease.id)
    ctx.result.leasesCreated++

    // Primary tenant_id is already set at insert; this loop now only surfaces the co-tenant "not linked" notice.
    for (const ar of activeRows) {
      await linkTenantToLease(ar, leaseId, ctx)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.result.errors.push({ rowIndex: index, field: "lease_start", message: `Lease error: ${msg}`, severity: "error" })
  }
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
  if (existingContactError) console.error("importRunner prev-tenant contacts lookup failed:", existingContactError.message)

  if (existingContact) {
    const { data: existingTenant, error: existingTenantError } = await ctx.supabase
      .from("tenants").select("id").eq("contact_id", existingContact.id).limit(1).maybeSingle()
    if (existingTenantError) console.error("importRunner prev-tenant tenants lookup failed:", existingTenantError.message)
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
  if (existingHistError) console.error("importRunner existing-history lookup failed:", existingHistError.message)
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
  }

  for (const [index, row] of rows.entries()) {
    const raw = getField(row, "__entity_type", mapping).toLowerCase().trim()
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
        // Unknown entity type — skip silently
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

async function isExistingVendor(
  email: string,
  displayName: string,
  orgId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  if (email) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from("contractor_view")
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()
    if (byEmailError) console.error("importRunner contractor_view email lookup failed:", byEmailError.message)
    if (byEmail) return true
  }

  if (displayName) {
    const { data: byName, error: byNameError } = await supabase
      .from("contractor_view")
      .select("id")
      .eq("org_id", orgId)
      .ilike("company_name", displayName)
      .limit(1)
      .maybeSingle()
    if (byNameError) console.error("importRunner contractor_view name lookup failed:", byNameError.message)
    if (byName) return true
  }

  return false
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
      if (await isExistingVendor(email, displayName, ctx.orgId, ctx.supabase)) {
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
      ctx.result.errors.push({
        rowIndex: i,
        field: "email",
        message: "Landlord email is required",
        severity: "error",
      })
      continue
    }

    try {
      // Dedup against properties.owner_email
      const { data: existingProperty, error: existingPropertyError } = await ctx.supabase
        .from("properties")
        .select("id")
        .eq("org_id", ctx.orgId)
        .ilike("owner_email", email)
        .limit(1)
        .maybeSingle()
      logIfError("importRunner properties owner_email lookup failed", existingPropertyError)

      if (existingProperty) {
        ctx.result.skipped++
        continue
      }

      // Dedup against pending_landlords.email
      const { data: existingPending, error: existingPendingError } = await ctx.supabase
        .from("landlord_view")
        .select("id")
        .eq("org_id", ctx.orgId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle()
      logIfError("importRunner landlord_view email lookup failed", existingPendingError)

      if (existingPending) {
        ctx.result.skipped++
        continue
      }

      const { firstName, lastName, companyName: landlordCompany } = resolveName(row, ctx.mapping)
      const landlordDisplay = landlordCompany || `${firstName} ${lastName}`.trim()
      const phone = getField(row, "phone", ctx.mapping) || null
      const idNumber = getField(row, "id_number", ctx.mapping) || null
      const vatNumber = getField(row, "vat_number", ctx.mapping) || null

      const { data: contact, error: contactError } = await ctx.supabase
        .from("contacts")
        .insert({
          org_id: ctx.orgId,
          entity_type: resolveEntityType(landlordCompany, landlordDisplay),
          primary_role: "landlord",
          first_name: firstName || (landlordCompany ? null : "Unknown"),
          last_name: lastName || (landlordCompany ? null : "Unknown"),
          company_name: landlordCompany || null,
          primary_email: email,
          primary_phone: phone,
          ...idNumberColumns(idNumber), // encrypted at rest + lookup hash (was raw, no hash)
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
      if (existingMemberError) console.error("importRunner get_org_member_by_email rpc failed:", existingMemberError.message)

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
      if (existingInviteError) console.error("importRunner invites lookup failed:", existingInviteError.message)

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
      agentInvitesSent: 0,
      bankAccountsImported: 0,
      skipped: 0,
      errors: [],
      pendingLandlordLinks: [],
      agentInvites: [],
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

  // Route rows by entity type
  const routed = routeRowsByType(rows, mapping)

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

  // Phase 10: Import agents
  await importAgents(routed.agentRows, ctx)

  return ctx.result
}
