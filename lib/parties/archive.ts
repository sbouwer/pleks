/**
 * lib/parties/archive.ts — in-force-lease guards for archiving a tenant / landlord (ADDENDUM_ARCHIVE_VS_ERASE §3C)
 *
 * Auth:   service client passed in (server-only); always org-scoped by the caller
 * Data:   leases (status), properties.landlord_id → units → leases
 * Notes:  Archive = soft-delete (set deleted_at). It must be BLOCKED while the party has an in-force
 *         lease — "in force" = the SAME predicate as rent roll (active + month_to_month + notice), so a
 *         tenant on notice still counts. Do NOT mint a fresh "active lease" definition here (D-6).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { IN_FORCE_LEASE_STATUSES } from "@/lib/leases/rentRoll"
import { logQueryError } from "@/lib/supabase/logQueryError"

const IN_FORCE = IN_FORCE_LEASE_STATUSES as readonly string[]

/** True when the tenant is the lessee on any in-force lease (blocks archive). */
export async function tenantHasInForceLease(
  db: SupabaseClient,
  orgId: string,
  tenantId: string,
): Promise<boolean> {
  const { count, error } = await db
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("tenant_id", tenantId)
    .in("status", IN_FORCE)
  logQueryError("tenantHasInForceLease", error)
  return (count ?? 0) > 0
}

/**
 * True when the landlord has any in-force lease — attributed directly (leases.landlord_id) or via a
 * property they own (properties.landlord_id → units → leases). landlord_id on a lease is nullable, so
 * the property route is the reliable one; we check both.
 */
export async function landlordHasInForceLease(
  db: SupabaseClient,
  orgId: string,
  landlordId: string,
): Promise<boolean> {
  // Directly attributed.
  const { count: directCount, error: directErr } = await db
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("landlord_id", landlordId)
    .in("status", IN_FORCE)
  logQueryError("landlordHasInForceLease direct", directErr)
  if ((directCount ?? 0) > 0) return true

  // Via owned properties' units.
  const { data: props, error: propsErr } = await db
    .from("properties")
    .select("id")
    .eq("org_id", orgId)
    .eq("landlord_id", landlordId)
  logQueryError("landlordHasInForceLease properties", propsErr)
  const propIds = (props ?? []).map((p) => p.id as string)
  if (propIds.length === 0) return false

  const { data: units, error: unitsErr } = await db
    .from("units")
    .select("id")
    .in("property_id", propIds)
  logQueryError("landlordHasInForceLease units", unitsErr)
  const unitIds = (units ?? []).map((u) => u.id as string)
  if (unitIds.length === 0) return false

  const { count: unitLeaseCount, error: leaseErr } = await db
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("unit_id", unitIds)
    .in("status", IN_FORCE)
  logQueryError("landlordHasInForceLease unit leases", leaseErr)
  return (unitLeaseCount ?? 0) > 0
}

/**
 * True when ANY lease on the property is in force (blocks archiving the property). leases.property_id
 * is NOT NULL on every lease, so this catches unit-level leases too (each carries the property_id).
 * ADDENDUM_PROPERTY_UNIT_ARCHIVE D-3.
 */
export async function propertyHasInForceLease(
  db: SupabaseClient,
  orgId: string,
  propertyId: string,
): Promise<boolean> {
  const { count, error } = await db
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .in("status", IN_FORCE)
  logQueryError("propertyHasInForceLease", error)
  return (count ?? 0) > 0
}

/** True when the unit has an in-force lease (blocks archiving the unit). D-2. */
export async function unitHasInForceLease(
  db: SupabaseClient,
  orgId: string,
  unitId: string,
): Promise<boolean> {
  const { count, error } = await db
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("unit_id", unitId)
    .in("status", IN_FORCE)
  logQueryError("unitHasInForceLease", error)
  return (count ?? 0) > 0
}
