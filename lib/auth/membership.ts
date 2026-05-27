/**
 * lib/auth/membership.ts — resolveUserMembership() — single active membership per user
 *
 * Auth:   server-side only (service client)
 * Notes:  Implements I-4 invariant: one email = one active role = one organisation.
 *         Replaces resolveUserRoles() from lib/auth/roles.ts (deprecated; do not add call sites).
 *         SovereignMembershipViolation is thrown when multiple active rows exist — a Postgres
 *         trigger should catch this first (defence in depth).
 */
import { createServiceClient } from "@/lib/supabase/server"

export type PortalClass = "agent" | "tenant" | "landlord" | "supplier"
export type OrgRole = "owner" | "property_manager" | "agent" | "accountant" | "maintenance_manager"

export interface ActiveMembership {
  portalClass: PortalClass
  /** user_orgs.org_id, user_orgs_tenants.tenant_id, landlords.id, or contractor_id */
  scopeId: string
  /** Always the anchor organisation for the membership row */
  orgId: string
  orgName: string
  /** Present only when portalClass === 'agent' */
  orgRole?: OrgRole
}

export class SovereignMembershipViolation extends Error {
  constructor(userId: string, count: number) {
    super(
      `SovereignMembershipViolation: user ${userId} has ${count} active memberships — I-4 violated`
    )
    this.name = "SovereignMembershipViolation"
  }
}

/**
 * Returns the user's single active membership, or null if none exist.
 *
 * Queries user_orgs (agent class), user_orgs_tenants (tenant class),
 * and landlords (landlord class) in parallel. Supplier class via contractors
 * will be added when ADDENDUM_19B ships.
 *
 * Throws SovereignMembershipViolation when > 1 active membership is found.
 * The application code at signup/invite time prevents this; the throw is
 * defence in depth against direct DB writes or application-layer drift.
 */
export async function resolveUserMembership(userId: string): Promise<ActiveMembership | null> {
  const service = await createServiceClient()
  const memberships: ActiveMembership[] = []

  const [agentRes, tenantRes, landlordRes] = await Promise.all([
    service
      .from("user_orgs")
      .select("role, org_id, organisations(name)")
      .eq("user_id", userId)
      .is("deleted_at", null),

    service
      .from("user_orgs_tenants")
      .select("tenant_id, org_id, organisations(name)")
      .eq("user_id", userId),

    service
      .from("landlords")
      .select("id, org_id, organisations(name)")
      .eq("auth_user_id", userId)
      .is("deleted_at", null)
      .eq("portal_access_enabled", true),
  ])

  for (const r of agentRes.data ?? []) {
    const orgName = (r.organisations as unknown as { name: string } | null)?.name ?? "Your agency"
    memberships.push({
      portalClass: "agent",
      scopeId:     r.org_id,
      orgId:       r.org_id,
      orgName,
      orgRole:     r.role as OrgRole,
    })
  }

  for (const r of tenantRes.data ?? []) {
    const orgName = (r.organisations as unknown as { name: string } | null)?.name ?? "Your agency"
    memberships.push({
      portalClass: "tenant",
      scopeId:     r.tenant_id,
      orgId:       r.org_id,
      orgName,
    })
  }

  for (const r of landlordRes.data ?? []) {
    const orgName = (r.organisations as unknown as { name: string } | null)?.name ?? "Your agency"
    memberships.push({
      portalClass: "landlord",
      scopeId:     r.id,
      orgId:       r.org_id,
      orgName,
    })
  }

  if (memberships.length === 0) return null
  if (memberships.length > 1) throw new SovereignMembershipViolation(userId, memberships.length)
  return memberships[0]
}
