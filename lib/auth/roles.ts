/**
 * lib/auth/roles.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createServiceClient } from "@/lib/supabase/server"

export type AgentRole = "owner" | "property_manager" | "agent" | "accountant" | "maintenance_manager"
export type PortalRole = "tenant" | "landlord" | "supplier" | "contractor"
export type SessionRole = AgentRole | PortalRole

export interface RoleMembership {
  role: SessionRole
  scope: "org" | "tenant" | "landlord" | "supplier"
  scope_id: string   // org_id / tenant_id / landlord_id
  org_id: string
  org_name: string
  label: string      // display label for the switcher UI
}

export const ROLE_DEFAULT_ROUTES: Record<SessionRole, string> = {
  tenant:              "/tenant/dashboard",
  landlord:            "/landlord/dashboard",
  supplier:            "/supplier/dashboard",
  contractor:          "/supplier/dashboard",
  owner:               "/dashboard",
  property_manager:    "/dashboard",
  agent:               "/dashboard",
  accountant:          "/dashboard",
  maintenance_manager: "/dashboard",
}

const AGENT_ROLE_LABELS: Record<string, string> = {
  owner:               "Owner",
  property_manager:    "Property manager",
  agent:               "Agent",
  accountant:          "Accountant",
  maintenance_manager: "Maintenance manager",
}

/**
 * Resolves all role memberships for a user across agent, tenant, and landlord
 * bridge tables. Returns an empty array if no roles found (zero-role state →
 * redirect to /onboarding).
 *
 * Must be called server-side (uses service client).
 */
export async function resolveUserRoles(userId: string): Promise<RoleMembership[]> {
  const service = await createServiceClient()
  const memberships: RoleMembership[] = []

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
      role:     r.role as AgentRole,
      scope:    "org",
      scope_id: r.org_id,
      org_id:   r.org_id,
      org_name: orgName,
      label:    `${AGENT_ROLE_LABELS[r.role] ?? r.role} at ${orgName}`,
    })
  }

  for (const r of tenantRes.data ?? []) {
    const orgName = (r.organisations as unknown as { name: string } | null)?.name ?? "Your agency"
    memberships.push({
      role:     "tenant",
      scope:    "tenant",
      scope_id: r.tenant_id,
      org_id:   r.org_id,
      org_name: orgName,
      label:    `Tenant · ${orgName}`,
    })
  }

  for (const r of landlordRes.data ?? []) {
    const orgName = (r.organisations as unknown as { name: string } | null)?.name ?? "Your agency"
    memberships.push({
      role:     "landlord",
      scope:    "landlord",
      scope_id: r.id,
      org_id:   r.org_id,
      org_name: orgName,
      label:    `Landlord · ${orgName}`,
    })
  }

  return memberships
}

export function defaultRoleForMemberships(memberships: RoleMembership[]): RoleMembership | null {
  if (memberships.length === 0) return null
  if (memberships.length === 1) return memberships[0]
  // Prefer agent role when exactly one agent role exists
  const agentRoles = memberships.filter(m => m.scope === "org")
  if (agentRoles.length === 1) return agentRoles[0]
  // No clear default — require explicit selection
  return null
}
