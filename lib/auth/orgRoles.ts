"use server"

/**
 * lib/auth/orgRoles.ts — per-org RBAC role resolver + owner-only mutations (ADDENDUM_RBAC Phase 1)
 *
 * Auth:   gateway() — reads are org-scoped; mutations are owner-only and audited.
 * Data:   org_roles (010 §43) as an OVERRIDE layer over the in-code built-ins (lib/auth/capabilities.ts).
 *         getOrgRoles merges code defaults with override rows; a row exists only once an org edits a
 *         built-in or adds a custom role. `owner` is implicit-all — never stored or listed here.
 * Notes:  Enforcement (can()) consumes capabilitiesForRole; gating real pages/actions is a later phase.
 */
import { gateway } from "@/lib/supabase/gateway"
import { recordAudit } from "@/lib/audit/recordAudit"
import {
  BUILTIN_ROLES, BUILTIN_ROLE_BY_SLUG, CAPABILITY_SLUGS, ALL_CAPABILITIES,
} from "./capabilities"

export interface OrgRole {
  slug: string
  label: string
  group: string | null
  capabilities: string[]
  isSystem: boolean   // built-in (true) vs org-created custom role (false)
  enabled: boolean
}

interface OrgRoleRow {
  slug: string
  label: string
  role_group: string | null
  is_system: boolean
  capabilities: string[]
  enabled: boolean
}

/** Merged role list for the current org: built-ins (with per-org overrides) + custom roles. */
export async function getOrgRoles(): Promise<OrgRole[]> {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data, error } = await db
    .from("org_roles").select("slug, label, role_group, is_system, capabilities, enabled").eq("org_id", orgId)
  if (error) console.error("getOrgRoles:", error.message)
  const overrides = new Map<string, OrgRoleRow>((data ?? []).map((r) => [(r as OrgRoleRow).slug, r as OrgRoleRow]))

  const result: OrgRole[] = []
  for (const b of BUILTIN_ROLES) {
    const o = overrides.get(b.slug)
    result.push({
      slug: b.slug,
      label: o?.label ?? b.label,
      group: o?.role_group ?? b.group,
      capabilities: o?.capabilities ?? b.defaultCapabilities,
      isSystem: true,
      enabled: o?.enabled ?? true,
    })
    overrides.delete(b.slug)
  }
  // Remaining override rows are org-created custom roles.
  for (const o of overrides.values()) {
    result.push({
      slug: o.slug,
      label: o.label,
      group: o.role_group ?? "Custom",
      capabilities: o.capabilities ?? [],
      isSystem: false,
      enabled: o.enabled,
    })
  }
  return result
}

/** Resolve a single role's capabilities (owner → all). For can() enforcement in a later phase. */
export async function capabilitiesForRole(roleSlug: string): Promise<string[]> {
  if (roleSlug === "owner") return [...ALL_CAPABILITIES]
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data, error } = await db
    .from("org_roles").select("capabilities").eq("org_id", orgId).eq("slug", roleSlug).maybeSingle()
  if (error) console.error("capabilitiesForRole:", error.message)
  if (data?.capabilities) return data.capabilities as string[]
  return BUILTIN_ROLE_BY_SLUG[roleSlug]?.defaultCapabilities ?? []
}

/** Create or update a role (built-in override or custom). Owner-only; audited. */
export async function saveOrgRole(input: Readonly<{
  slug: string
  label: string
  group: string | null
  capabilities: string[]
  enabled?: boolean
  isSystem: boolean
}>): Promise<{ ok: true } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId, role } = gw
  if (role !== "owner") return { error: "Only the owner can edit roles" }
  const slug = input.slug.trim()
  const label = input.label.trim()
  if (!slug || !label) return { error: "A role needs a name" }
  const capabilities = input.capabilities.filter((c) => CAPABILITY_SLUGS.includes(c))
  const enabled = input.enabled ?? true

  const { error } = await db.from("org_roles").upsert({
    org_id: orgId, slug, label, role_group: input.group, is_system: input.isSystem, capabilities, enabled,
  }, { onConflict: "org_id,slug" })
  if (error) return { error: error.message }

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "org_roles", recordId: orgId,
    after: { action: "role_saved", slug, capabilities, enabled, is_system: input.isSystem },
  })
  return { ok: true }
}

/** Delete a custom role (built-ins can only be disabled). Owner-only; audited. */
export async function deleteOrgRole(slug: string): Promise<{ ok: true } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId, role } = gw
  if (role !== "owner") return { error: "Only the owner can edit roles" }
  if (BUILTIN_ROLE_BY_SLUG[slug]) return { error: "Built-in roles can be disabled, not deleted" }

  const { error } = await db.from("org_roles").delete().eq("org_id", orgId).eq("slug", slug).eq("is_system", false)
  if (error) return { error: error.message }
  await recordAudit(db, {
    orgId, actorId: userId, action: "DELETE", table: "org_roles", recordId: orgId,
    after: { action: "role_deleted", slug },
  })
  return { ok: true }
}
