"use server"

/**
 * lib/work/myPortfolio.ts — "my portfolio" resolver (ADDENDUM_TEAMS Layer 0, relationship entities)
 *
 * Auth:   gateway() — caller's org + userId; service client (org-scoped queries).
 * Data:   properties.managing_agent_id is the anchor. Resolves, server-side, the entity ids that belong to
 *         the current agent's portfolio: the properties they manage + the leases/tenants/landlords hanging
 *         off those properties. Returns id arrays; the client checks `row.id` membership (no per-loader
 *         joins, no cross-table OR in a list query). Distinct from the work-item flat `assigned_user_id`
 *         path (maintenance/applications/inspections) — those carry a direct assignee.
 * Notes:  Leases link to a property via units (lease.unit_id → units.property_id). Co-tenants count too.
 */
import { gateway } from "@/lib/supabase/gateway"

export interface MyPortfolio {
  propertyIds: string[]
  landlordIds: string[]
  leaseIds: string[]
  tenantIds: string[]
}

const EMPTY: MyPortfolio = { propertyIds: [], landlordIds: [], leaseIds: [], tenantIds: [] }

export async function getMyPortfolio(): Promise<MyPortfolio> {
  const gw = await gateway()
  if (!gw) return EMPTY
  const { db, orgId, userId } = gw

  // 1. Properties I manage — directly (managing_agent_id) or via a team I'm on (managing_team_id) — →
  //    property ids + the landlords who own them.
  const { data: tm, error: tmErr } = await db
    .from("team_members").select("team_id").eq("org_id", orgId).eq("user_id", userId)
  if (tmErr) console.error("getMyPortfolio team_members:", tmErr.message)
  const myTeamIds = (tm ?? []).map((r) => r.team_id as string)

  let propQuery = db.from("properties").select("id, landlord_id").eq("org_id", orgId).is("deleted_at", null)
  propQuery = myTeamIds.length > 0
    ? propQuery.or(`managing_agent_id.eq.${userId},managing_team_id.in.(${myTeamIds.join(",")})`)
    : propQuery.eq("managing_agent_id", userId)
  const { data: props, error: pErr } = await propQuery
  if (pErr) { console.error("getMyPortfolio properties:", pErr.message); return EMPTY }
  const propertyIds = (props ?? []).map((p) => p.id as string)
  const landlordIds = [...new Set((props ?? []).map((p) => p.landlord_id as string | null).filter((x): x is string => !!x))]
  if (propertyIds.length === 0) return { propertyIds, landlordIds, leaseIds: [], tenantIds: [] }

  // 2. Units on my properties → leases on those units.
  const { data: units, error: uErr } = await db
    .from("units").select("id").eq("org_id", orgId).in("property_id", propertyIds)
  if (uErr) { console.error("getMyPortfolio units:", uErr.message); return { propertyIds, landlordIds, leaseIds: [], tenantIds: [] } }
  const unitIds = (units ?? []).map((u) => u.id as string)
  if (unitIds.length === 0) return { propertyIds, landlordIds, leaseIds: [], tenantIds: [] }

  const { data: leases, error: lErr } = await db
    .from("leases").select("id, tenant_id").eq("org_id", orgId).in("unit_id", unitIds).is("deleted_at", null)
  if (lErr) { console.error("getMyPortfolio leases:", lErr.message); return { propertyIds, landlordIds, leaseIds: [], tenantIds: [] } }
  const leaseIds = (leases ?? []).map((l) => l.id as string)
  const tenantIdSet = new Set((leases ?? []).map((l) => l.tenant_id as string | null).filter((x): x is string => !!x))

  // 3. Co-tenants on my leases also count as my tenants.
  if (leaseIds.length > 0) {
    const { data: coTenants, error: cErr } = await db
      .from("lease_co_tenants").select("tenant_id").in("lease_id", leaseIds)
    if (cErr) console.error("getMyPortfolio co-tenants:", cErr.message)
    for (const c of coTenants ?? []) {
      const tid = c.tenant_id as string | null
      if (tid) tenantIdSet.add(tid)
    }
  }

  return { propertyIds, landlordIds, leaseIds, tenantIds: [...tenantIdSet] }
}
