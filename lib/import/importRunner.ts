import type { SupabaseClient } from "@supabase/supabase-js"
import { normaliseDate, normaliseCurrencyCents } from "./normalise"
import { normaliseBranchCode } from "./bankImport"

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
  unitIdCache: Map<string, string>
  tenantIdCache: Map<string, string>
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
  const email = rawEmail.toLowerCase().trim()
  if (!email) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: "Tenant email is required", severity: "error" })
    return
  }
  if (ctx.tenantIdCache.has(email)) return

  try {
    const { data: existing } = await ctx.supabase
      .from("contacts").select("id").eq("org_id", ctx.orgId).ilike("primary_email", email).limit(1).single()

    if (existing) {
      ctx.tenantIdCache.set(email, String(existing.id))
      ctx.result.skipped++
      return
    }

    const { firstName, lastName, companyName: tenantCompany } = resolveName(entry.row, ctx.mapping)
    const displayForTenant = tenantCompany || `${firstName} ${lastName}`.trim()

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
        id_number: getField(entry.row, "id_number", ctx.mapping) || null,
      })
      .select("id").single()

    if (contactError || !contact) {
      ctx.result.errors.push({ rowIndex: entry.index, field: "email", message: `Failed to create contact: ${contactError?.message ?? "Unknown error"}`, severity: "error" })
      return
    }

    const { data: created, error } = await ctx.supabase
      .from("tenants")
      .insert({
        org_id: ctx.orgId,
        contact_id: contact.id,
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
  const email = rawEmail.toLowerCase().trim()
  if (!email) return
  if (ctx.tenantIdCache.has(email)) return

  const { data: existing } = await ctx.supabase
    .from("contacts").select("id").eq("org_id", ctx.orgId).ilike("primary_email", email).limit(1).single()

  if (existing) {
    ctx.tenantIdCache.set(email, String(existing.id))
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
      id_number: idNumber || null,
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

  // Need a tenant_id — check cache or create contact+tenant
  let tenantId = email ? ctx.tenantIdCache.get(email) : undefined

  if (!tenantId && email) {
    // Try to find existing contact
    const { data: existingContact } = await ctx.supabase
      .from("contacts").select("id").eq("org_id", ctx.orgId).ilike("primary_email", email).limit(1).single()

    if (existingContact) {
      const { data: existingTenant } = await ctx.supabase
        .from("tenants").select("id").eq("contact_id", existingContact.id).limit(1).single()
      if (existingTenant) {
        tenantId = String(existingTenant.id)
        ctx.tenantIdCache.set(email, tenantId)
      }
    }

    if (!tenantId) {
      // Create contact + tenant for the previous tenant
      const { firstName, lastName, companyName: prevTenantCompany } = resolveName(entry.row, ctx.mapping)
      const prevDisplay = prevTenantCompany || `${firstName} ${lastName}`.trim()
      const { data: contact } = await ctx.supabase
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

      if (contact) {
        const { data: tenant } = await ctx.supabase
          .from("tenants")
          .insert({ org_id: ctx.orgId, contact_id: contact.id })
          .select("id").single()

        if (tenant) {
          tenantId = String(tenant.id)
          ctx.tenantIdCache.set(email, tenantId)
        }
      }
    }
  }

  if (!tenantId) {
    ctx.result.errors.push({ rowIndex: entry.index, field: "tenancy_history", message: "Cannot create history without tenant email", severity: "warning" })
    return
  }

  try {
    const { error } = await ctx.supabase.from("tenancy_history").insert({
      unit_id: unitId,
      org_id: ctx.orgId,
      tenant_id: tenantId,
      move_in_date: leaseStart ? normaliseDate(leaseStart) : null,
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
    await ctx.supabase.from("audit_log").insert({
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

// ── Entity routing ──────────────────────────────────────────────────────

interface RoutedRows {
  tenantRows: Record<string, string>[]
  vendorRows: Record<string, string>[]
  landlordRows: Record<string, string>[]
  agentRows: Record<string, string>[]
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

  for (const row of rows) {
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
        result.tenantRows.push(row)
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
        result.vendorRows.push(row)
        break
      case "landlord":
      case "owner":
      case "verhuurder":
      case "eienaar":
        result.landlordRows.push(row)
        break
      case "agent":
      case "principal agent":
      case "administrator":
        result.agentRows.push(row)
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

async function importVendors(
  vendorRows: Record<string, string>[],
  ctx: ImportContext
): Promise<void> {
  const seenEmails = new Set<string>()

  for (let i = 0; i < vendorRows.length; i++) {
    const row = vendorRows[i]
    if (!row) continue

    const email = getField(row, "email", ctx.mapping).toLowerCase()
    const { displayName, companyName, firstName, lastName } = resolveVendorName(row, ctx.mapping)

    // Dedup by email within this batch
    if (email && seenEmails.has(email)) continue
    if (email) seenEmails.add(email)

    try {
      // Dedup by email against existing contractors
      if (email) {
        const { data: existingByEmail } = await ctx.supabase
          .from("contractor_view")
          .select("id")
          .eq("org_id", ctx.orgId)
          .ilike("email", email)
          .limit(1)
          .single()

        if (existingByEmail) {
          ctx.result.skipped++
          continue
        }
      }

      // Dedup by name against existing contractors
      if (displayName) {
        const { data: existingByName } = await ctx.supabase
          .from("contractor_view")
          .select("id")
          .eq("org_id", ctx.orgId)
          .ilike("company_name", displayName)
          .limit(1)
          .single()

        if (existingByName) {
          ctx.result.skipped++
          continue
        }
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

      const normalizedType = getField(row, "__entity_type", ctx.mapping)
        .toLowerCase().trim()
        .replace(/\b(individual|person|company|organisation|organization|cc|pty\s*ltd|ltd|inc)\b/g, "")
        .replace(/[-_]/g, " ").replace(/\s+/g, " ").trim()
      const supplierType =
        normalizedType === "managing scheme" || normalizedType === "body corporate"
          ? "managing_scheme"
          : normalizedType === "utility" || normalizedType === "utilities" || normalizedType === "municipality" || normalizedType === "munisipaliteit" || normalizedType === "munisipalite"
            ? "utility"
            : "contractor"

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
  landlordRows: Record<string, string>[],
  ctx: ImportContext
): Promise<void> {
  for (let i = 0; i < landlordRows.length; i++) {
    const row = landlordRows[i]
    if (!row) continue

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
      const { data: existingProperty } = await ctx.supabase
        .from("properties")
        .select("id")
        .eq("org_id", ctx.orgId)
        .ilike("owner_email", email)
        .limit(1)
        .single()

      if (existingProperty) {
        ctx.result.skipped++
        continue
      }

      // Dedup against pending_landlords.email
      const { data: existingPending } = await ctx.supabase
        .from("landlord_view")
        .select("id")
        .eq("org_id", ctx.orgId)
        .ilike("email", email)
        .limit(1)
        .single()

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
          id_number: idNumber,
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
  agentRows: Record<string, string>[],
  ctx: ImportContext
): Promise<void> {
  for (let i = 0; i < agentRows.length; i++) {
    const row = agentRows[i]
    if (!row) continue

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
      const { data: existingMember } = await ctx.supabase
        .rpc("get_org_member_by_email", { p_org_id: ctx.orgId, p_email: email })

      if (existingMember && (Array.isArray(existingMember) ? existingMember.length > 0 : true)) {
        ctx.result.skipped++
        continue
      }

      // Dedup: check existing invites
      const { data: existingInvite } = await ctx.supabase
        .from("invites")
        .select("id")
        .eq("org_id", ctx.orgId)
        .ilike("email", email)
        .limit(1)
        .single()

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
      skipped: 0,
      errors: [],
      pendingLandlordLinks: [],
      agentInvites: [],
    },
    unitIdCache: new Map(),
    tenantIdCache: new Map(),
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
