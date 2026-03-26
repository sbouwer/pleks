import type { ColumnMapping } from "./importRunner"

export type TenantRole = "primary" | "co_tenant" | "previous"

export interface ConflictHint {
  type: "likely_duplicate" | "likely_previous" | "likely_co_tenant"
  reason: string
}

export interface ConflictGroup {
  /** Normalised key: property_name|unit_number */
  unitKey: string
  /** Indices of rows in this group */
  rowIndices: number[]
  /** Names of tenants in this group */
  tenantNames: string[]
  /** Detected hint about what kind of conflict this is */
  hint: ConflictHint
}

/**
 * Get a field value from a row using the column mapping.
 */
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

/**
 * Extract tenant name from a row, handling both split and combined name fields.
 */
function getTenantName(row: Record<string, string>, mapping: ColumnMapping): string {
  const firstName = getField(row, "first_name", mapping)
  const lastName = getField(row, "last_name", mapping)

  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim()
  }

  // Try __split_name field (full name)
  return getField(row, "__split_name", mapping)
}

const WHITESPACE_RE = /\s+/g

/**
 * Check if two names are very similar (case-insensitive, ignoring extra whitespace).
 */
function namesAreSimilar(a: string, b: string): boolean {
  const normA = a.toLowerCase().replaceAll(WHITESPACE_RE, " ").trim()
  const normB = b.toLowerCase().replaceAll(WHITESPACE_RE, " ").trim()
  return normA === normB
}

/**
 * Detect conflicts where multiple rows map to the same unit.
 * Groups rows by property_name + unit_number and classifies conflicts.
 */
export function detectUnitConflicts(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): ConflictGroup[] {
  // Group rows by unit key
  const groups = new Map<string, { indices: number[]; names: string[] }>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const propertyName = getField(row, "property_name", mapping).toLowerCase()
    const unitNumber = getField(row, "unit_number", mapping).toLowerCase()

    if (!propertyName && !unitNumber) continue

    const key = `${propertyName}|${unitNumber}`
    const existing = groups.get(key)
    const tenantName = getTenantName(row, mapping)

    if (existing) {
      existing.indices.push(i)
      existing.names.push(tenantName)
    } else {
      groups.set(key, { indices: [i], names: [tenantName] })
    }
  }

  // Only return groups with conflicts (more than one row)
  const conflicts: ConflictGroup[] = []

  for (const [unitKey, group] of groups) {
    if (group.indices.length <= 1) continue

    const hint = classifyConflict(rows, group.indices, group.names, mapping)

    conflicts.push({
      unitKey,
      rowIndices: group.indices,
      tenantNames: group.names,
      hint,
    })
  }

  return conflicts
}

function checkForDuplicates(names: string[]): ConflictHint | null {
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const nameA = names[i]
      const nameB = names[j]
      if (nameA && nameB && namesAreSimilar(nameA, nameB)) {
        return {
          type: "likely_duplicate",
          reason: `Same tenant name "${nameA}" appears multiple times for this unit`,
        }
      }
    }
  }
  return null
}

function checkForPreviousTenant(
  rows: Record<string, string>[],
  indices: number[],
  mapping: ColumnMapping
): ConflictHint | null {
  const leaseStarts: string[] = []
  for (const idx of indices) {
    const row = rows[idx]
    if (!row) continue
    const start = getField(row, "lease_start", mapping)
    if (start) leaseStarts.push(start)
  }

  if (leaseStarts.length < 2) return null

  const dates = leaseStarts
    .map((s) => new Date(s).getTime())
    .filter((t) => !Number.isNaN(t))

  if (dates.length < 2) return null

  const sorted = dates.toSorted((a, b) => a - b)
  const first = sorted[0] ?? 0
  const last = sorted.at(-1) ?? 0
  const daysDiff = (last - first) / (1000 * 60 * 60 * 24)

  if (daysDiff > 90) {
    return {
      type: "likely_previous",
      reason: `Lease start dates differ by ${Math.round(daysDiff)} days — likely a previous tenant`,
    }
  }

  return null
}

function classifyConflict(
  rows: Record<string, string>[],
  indices: number[],
  names: string[],
  mapping: ColumnMapping
): ConflictHint {
  const duplicateHint = checkForDuplicates(names)
  if (duplicateHint) return duplicateHint

  const previousHint = checkForPreviousTenant(rows, indices, mapping)
  if (previousHint) return previousHint

  // Check for co-tenants: same lease start, different names
  const leaseStarts: string[] = []
  for (const idx of indices) {
    const row = rows[idx]
    if (!row) continue
    const start = getField(row, "lease_start", mapping)
    if (start) leaseStarts.push(start)
  }

  const uniqueStarts = new Set(leaseStarts)
  const uniqueNames = new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))

  if (uniqueStarts.size <= 1 && uniqueNames.size > 1) {
    return {
      type: "likely_co_tenant",
      reason: "Same lease start date with different tenant names — likely co-tenants",
    }
  }

  // Default: co-tenant (different names, can't determine otherwise)
  return {
    type: "likely_co_tenant",
    reason: "Multiple tenants assigned to the same unit",
  }
}
