/**
 * lib/auth/can.ts — server-side capability resolution (ADDENDUM_RBAC Phase 4 primitives)
 *
 * Auth:   gateway() session.
 * Data:   user_orgs (role / additional_roles / is_admin) + org_roles capabilities (via getOrgRoles).
 * Notes:  getMyCapabilities is the SSOT for "what can the current user do in this org". owner / is_admin
 *         resolve to ALL capabilities. can() is the server boundary helper; the client useCan() is
 *         affordance-only and hydrates from this. React.cache'd per request. NO gating is wired here —
 *         these are the primitives; surfaces adopt them one at a time (Phase 4 rollout). Lives outside the
 *         "use server" orgRoles module so it can be React.cache'd and called from server components/guards.
 */
import { cache } from "react"
import { gateway } from "@/lib/supabase/gateway"
import { getOrgRoles } from "./orgRoles"
import { ALL_CAPABILITIES, BUILTIN_ROLE_BY_SLUG } from "./capabilities"

/** Every capability the current user holds in their active org. owner / is_admin → all. */
export const getMyCapabilities = cache(async (): Promise<string[]> => {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId, userId, role } = gw

  const { data, error } = await db
    .from("user_orgs")
    .select("is_admin, additional_roles")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) console.error("getMyCapabilities:", error.message)

  const row = data as { is_admin: boolean | null; additional_roles: string[] | null } | null
  if (role === "owner" || row?.is_admin === true) return [...ALL_CAPABILITIES]

  const roles = await getOrgRoles()
  const capsBySlug = new Map(roles.map((r) => [r.slug, r.capabilities]))
  const mine = new Set<string>()
  for (const slug of [role, ...(row?.additional_roles ?? [])]) {
    const caps = capsBySlug.get(slug) ?? BUILTIN_ROLE_BY_SLUG[slug]?.defaultCapabilities ?? []
    for (const c of caps) mine.add(c)
  }
  return [...mine]
})

/** Server boundary check: does the current user hold `capability`? (owner / is_admin always true.) */
export async function can(capability: string): Promise<boolean> {
  return (await getMyCapabilities()).includes(capability)
}
