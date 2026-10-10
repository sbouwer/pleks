/**
 * lib/auth/assignableRoleSlugs.ts — server-side allowlist of the role slugs an org may assign
 *
 * Auth:   none of its own — callers are the team invite/member API routes, which authenticate via
 *         getMembership and pass that membership's orgId. Deliberately NOT a "use server" module (it lived in
 *         lib/auth/orgRoles.ts, where it was a callable endpoint reading any org's roles by caller orgId).
 * Data:   org_roles (service client, org-scoped) over the in-code built-ins; tier via getOrgTierCanonical
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { allowedRoleSlugs } from "./roleTiers"
import { BUILTIN_ROLES, BUILTIN_ROLE_BY_SLUG } from "./capabilities"

/** Built-ins gated by tier + enabled; customs if enabled. */
export async function assignableRoleSlugs(orgId: string): Promise<Set<string>> {
  const tier = await getOrgTierCanonical(orgId)
  const allowed = allowedRoleSlugs(tier)
  const service = await createServiceClient()
  const { data, error } = await service.from("org_roles").select("slug, is_system, enabled").eq("org_id", orgId)
  if (error) console.error("assignableRoleSlugs:", error.message)
  const rows = (data ?? []) as { slug: string; is_system: boolean; enabled: boolean }[]
  const overrides = new Map(rows.map((r) => [r.slug, r]))
  const set = new Set<string>()
  for (const b of BUILTIN_ROLES) {
    if (allowed !== "all" && !allowed.has(b.slug)) continue
    if (overrides.get(b.slug)?.enabled === false) continue
    set.add(b.slug)
  }
  for (const r of rows) {
    if (BUILTIN_ROLE_BY_SLUG[r.slug] || r.is_system) continue
    if (r.enabled) set.add(r.slug)
  }
  return set
}
