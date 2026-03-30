import type { SupabaseClient } from "@supabase/supabase-js"
import { normaliseDate, normaliseCurrencyCents } from "./normalise"

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
  skipped: number
  errors: ImportError[]
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
  supabase: SupabaseClient
  result: ImportResult
  unitIdCache: Map<string, string>
  tenantIdCache: Map<string, string>
}

// ── Field helpers ──────────────────────────────────────────────────────

function getField(
  row: Record<string, string>,
  fieldName: string,
  mapping: ColumnMapping
): string {
  for (const mapped of Object.values(mapping)) {
    if (mapped.field === fieldName) {
      return (row[mapped.column] ?? "").trim()
    }
  }
  return ""
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

function resolveName(row: Record<string, string>, mapping: ColumnMapping): { firstName: string; lastName: string } {
  const firstName = getField(row, "first_name", mapping)
  const lastName = getField(row, "last_name", mapping)

  if (firstName || lastName) return { firstName, lastName }

  const fullName = getField(row, "__split_name", mapping)
  return fullName ? splitFullName(fullName) : { firstName: "", lastName: "" }
}

function getExtraColumns(
  row: Record<string, string>,
  mapping: ColumnMapping
): Record<string, string> {
  const mappedColumns = new Set(Object.keys(mapping))
  const extras: Record<string, string> = {}
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
  rows: Record<string, string>[],
  ctx: ImportContext,
  conflictMap: Map<number, ConflictDecision>,
  skipSet: Set<number>
): Map<string, UnitGroup> {
  const unitGroups = new Map<string, UnitGroup>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || skipSet.has(i)) { ctx.result.skipped++; continue }

    const conflict = conflictMap.get(i)
    if (conflict?.resolution === "skip") { ctx.result.skipped++; continue }
    if (conflict?.resolution === "duplicate" && conflict.rowIndices[0] !== i) { ctx.result.skipped++; continue }

    const propertyName = getField(row, "property_name", ctx.mapping)
    const unitNumber = getField(row, "unit_number", ctx.mapping)
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
  ctx: ImportContext,
  cache: Map<string, string>
): Promise<string | null> {
  const cacheKey = propertyName.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const { data: existing } = await ctx.supabase
    .from("properties").select("id").eq("org_id", ctx.orgId).ilike("name", propertyName).limit(1).single()

  if (existing) {
    const id = String(existing.id)
    cache.set(cacheKey, id)
    return id
  }

  const { data: created, error } = await ctx.supabase
    .from("properties")
    .insert({
      org_id: ctx.orgId,
      name: propertyName,
      address_line1: getField(row, "address", ctx.mapping) || null,
      suburb: getField(row, "suburb", ctx.mapping) || null,
      city: getField(row, "city", ctx.mapping) || null,
      province: getField(row, "province", ctx.mapping) || null,
    })
    .select("id").single()

  if (error || !created) return null

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

  const { data: existing } = await ctx.supabase
    .from("units").select("id").eq("property_id", propertyId).ilike("unit_number", group.unitNumber).limit(1).single()

  if (existing) {
    const id = String(existing.id)
    ctx.unitIdCache.set(unitKey, id)
    return id
  }

  const row = group.rows[0]?.row ?? {}
  const bedrooms = getField(row, "bedrooms", ctx.mapping)
  const bathrooms = getField(row, "bathrooms", ctx.mapping)

  const { data: created, error } = await ctx.supabase
    .from("units")
    .insert({
      property_id: propertyId,
      org_id: ctx.orgId,
      unit_number: group.unitNumber || "1",
      bedrooms: bedrooms ? Number.parseInt(bedrooms, 10) || null : null,
      bathrooms: bathrooms ? Number.parseInt(bathrooms, 10) || null : null,
    })
    .select("id").single()

  if (error || !created) return null

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
      const propertyId = await upsertProperty(group.propertyName, firstRow.row, ctx, propertyIdCache)
      if (!propertyId) {
        ctx.result.errors.push({ rowIndex: firstRow.index, field: "property_name", message: "Failed to create property", severity: "error" })
        continue
      }
      const unitId = await upsertUnit(unitKey, group, propertyId, ctx)
      if (!unitId) {
        ctx.result.errors.push({ rowIndex: firstRow.index, field: "unit_number", message: "Failed to create unit", severity: "error" })
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

async function upsertTenant(entry: UnitGroupEntry, ctx: ImportContext): Promise<void> {
  const email = getField(entry.row, "email", ctx.mapping).toLowerCase()
  if (!email) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: "Tenant email is required", severity: "error" })
    return
  }
  if (ctx.tenantIdCache.has(email)) return

  try {
    const { data: existing } = await ctx.supabase
      .from("tenants").select("id").eq("org_id", ctx.orgId).ilike("email", email).limit(1).single()

    if (existing) {
      ctx.tenantIdCache.set(email, String(existing.id))
      ctx.result.skipped++
      return
    }

    const { firstName, lastName } = resolveName(entry.row, ctx.mapping)

    const { data: created, error } = await ctx.supabase
      .from("tenants")
      .insert({
        org_id: ctx.orgId,
        first_name: firstName || "Unknown",
        last_name: lastName || "Unknown",
        email,
        phone: getField(entry.row, "phone", ctx.mapping) || null,
        id_number: getField(entry.row, "id_number", ctx.mapping) || null,
        employer_name: getField(entry.row, "employer_name", ctx.mapping) || null,
      })
      .select("id").single()

    if (error || !created) {
      ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Failed to create tenant: ${error?.message ?? "Unknown error"}`, severity: "error" })
      return
    }

    ctx.tenantIdCache.set(email, String(created.id))
    ctx.result.tenantsCreated++
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Tenant error: ${msg}`, severity: "error" })
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

    const activeRows = group.rows.filter((r) => r.role !== "previous")
    const previousRows = group.rows.filter((r) => r.role === "previous")

    if (activeRows.length > 0) {
      await processActiveLease(activeRows, unitId, ctx)
    }

    for (const prev of previousRows) {
      await createTenancyHistory(prev, unitId, ctx)
    }
  }
}

function buildLeaseData(
  row: Record<string, string>,
  unitId: string,
  isExpired: boolean,
  normalisedEnd: string | null,
  ctx: ImportContext
): Record<string, unknown> {
  const leaseStart = getField(row, "lease_start", ctx.mapping)
  const rentRaw = getField(row, "rent_amount_cents", ctx.mapping)
  const depositRaw = getField(row, "deposit_amount_cents", ctx.mapping)
  const escalationRaw = getField(row, "escalation_percent", ctx.mapping)
  const escalation = escalationRaw ? Number.parseFloat(escalationRaw) : null

  return {
    unit_id: unitId,
    org_id: ctx.orgId,
    start_date: leaseStart ? normaliseDate(leaseStart) : null,
    end_date: isExpired && ctx.decisions.expiredLeases === "import_as_history" ? normalisedEnd : (normalisedEnd || null),
    rent_amount_cents: rentRaw ? normaliseCurrencyCents(rentRaw) : null,
    deposit_amount_cents: depositRaw ? normaliseCurrencyCents(depositRaw) : null,
    escalation_percent: escalation !== null && !Number.isNaN(escalation) ? escalation : null,
    payment_method: getField(row, "payment_method", ctx.mapping) || null,
    status: isExpired ? "expired" : "active",
  }
}

async function processActiveLease(
  activeRows: UnitGroupEntry[],
  unitId: string,
  ctx: ImportContext
): Promise<void> {
  const firstActive = activeRows[0]
  if (!firstActive) return

  const { row, index } = firstActive
  const leaseEnd = getField(row, "lease_end", ctx.mapping)
  const normalisedEnd = leaseEnd ? normaliseDate(leaseEnd) : null
  const isExpired = normalisedEnd ? new Date(normalisedEnd) < new Date() : false

  if (isExpired && ctx.decisions.expiredLeases === "import_active_only") {
    for (const ar of activeRows) {
      await createTenancyHistory(ar, unitId, ctx)
    }
    return
  }

  try {
    const leaseData = buildLeaseData(row, unitId, isExpired, normalisedEnd, ctx)

    const { data: newLease, error } = await ctx.supabase
      .from("leases").insert(leaseData).select("id").single()

    if (error || !newLease) {
      ctx.result.errors.push({ rowIndex: index, field: "lease_start", message: `Failed to create lease: ${error?.message ?? "Unknown error"}`, severity: "error" })
      return
    }

    const leaseId = String(newLease.id)
    ctx.result.leasesCreated++

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
  const email = getField(entry.row, "email", ctx.mapping).toLowerCase()
  const tenantId = ctx.tenantIdCache.get(email)
  if (!tenantId) return

  const { error } = await ctx.supabase
    .from("lease_tenants")
    .insert({
      lease_id: leaseId,
      tenant_id: tenantId,
      role: entry.role === "co_tenant" ? "co_tenant" : "primary",
    })

  if (error) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Failed to link tenant to lease: ${error.message}`, severity: "warning" })
  }
}

async function createTenancyHistory(
  entry: UnitGroupEntry,
  unitId: string,
  ctx: ImportContext
): Promise<void> {
  const email = getField(entry.row, "email", ctx.mapping).toLowerCase()
  const leaseStart = getField(entry.row, "lease_start", ctx.mapping)
  const leaseEnd = getField(entry.row, "lease_end", ctx.mapping)
  const rentRaw = getField(entry.row, "rent_amount_cents", ctx.mapping)
  const { firstName, lastName } = resolveName(entry.row, ctx.mapping)

  try {
    const { error } = await ctx.supabase.from("tenancy_history").insert({
      unit_id: unitId,
      org_id: ctx.orgId,
      tenant_name: `${firstName} ${lastName}`.trim() || "Unknown",
      tenant_email: email || null,
      start_date: leaseStart ? normaliseDate(leaseStart) : null,
      end_date: leaseEnd ? normaliseDate(leaseEnd) : null,
      rent_amount_cents: rentRaw ? normaliseCurrencyCents(rentRaw) : null,
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

async function writeNoteForEntry(
  entry: UnitGroupEntry,
  unitId: string,
  ctx: ImportContext
): Promise<void> {
  const extras = getExtraColumns(entry.row, ctx.mapping)
  if (Object.keys(extras).length === 0) return

  const email = getField(entry.row, "email", ctx.mapping).toLowerCase()
  const tenantId = ctx.tenantIdCache.get(email)

  const noteLines = Object.entries(extras)
    .map(([col, val]) => `${col}: ${val}`)
    .join("\n")

  try {
    const { error } = await ctx.supabase.from("notes").insert({
      org_id: ctx.orgId,
      entity_type: tenantId ? "tenant" : "unit",
      entity_id: tenantId ?? unitId,
      content: `Imported data:\n${noteLines}`,
      created_by: ctx.agentId,
    })

    if (error) {
      ctx.result.errors.push({ rowIndex: entry.index, field: "notes", message: `Failed to create note: ${error.message}`, severity: "warning" })
    } else {
      ctx.result.notesCreated++
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.result.errors.push({ rowIndex: entry.index, field: "notes", message: `Note error: ${msg}`, severity: "warning" })
  }
}

async function writeNotes(
  unitGroups: Map<string, UnitGroup>,
  ctx: ImportContext
): Promise<void> {
  for (const [unitKey, group] of unitGroups) {
    const unitId = ctx.unitIdCache.get(unitKey)
    if (!unitId) continue

    for (const entry of group.rows) {
      await writeNoteForEntry(entry, unitId, ctx)
    }
  }
}

// ── Phase 7: Audit log ────────────────────────────────────────────────

async function writeAuditLog(ctx: ImportContext): Promise<void> {
  try {
    await ctx.supabase.from("audit_logs").insert({
      org_id: ctx.orgId,
      user_id: ctx.agentId,
      action: "bulk_import",
      details: {
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

// ── Main Import Runner ─────────────────────────────────────────────────

export async function runImport(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  decisions: ImportDecisions,
  orgId: string,
  agentId: string,
  supabase: SupabaseClient
): Promise<ImportResult> {
  const ctx: ImportContext = {
    mapping,
    decisions,
    orgId,
    agentId,
    supabase,
    result: {
      propertiesCreated: 0,
      unitsCreated: 0,
      tenantsCreated: 0,
      leasesCreated: 0,
      historyCreated: 0,
      notesCreated: 0,
      skipped: 0,
      errors: [],
    },
    unitIdCache: new Map(),
    tenantIdCache: new Map(),
  }

  // Build conflict lookup
  const skipSet = new Set<number>(decisions.skipRows ?? [])
  const conflictMap = new Map<number, ConflictDecision>()
  for (const cd of decisions.conflicts ?? []) {
    for (const idx of cd.rowIndices) {
      conflictMap.set(idx, cd)
    }
  }

  // Phase 1: Group rows by unit
  const unitGroups = buildUnitGroups(rows, ctx, conflictMap, skipSet)

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

  return ctx.result
}
