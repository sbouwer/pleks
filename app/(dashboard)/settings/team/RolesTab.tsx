/**
 * app/(dashboard)/settings/team/RolesTab.tsx — Roles tab (owner-only) server wrapper
 *
 * Route:  /settings/team?tab=roles
 * Auth:   owner-gated by the page (tab only appears for owners); mutations re-check owner server-side
 * Data:   getOrgRoles (merged built-ins + per-org overrides + custom roles), filtered by the org's tier
 *         (lib/auth/roleTiers) → RolesManager (client)
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getOrgRoles } from "@/lib/auth/orgRoles"
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { allowedRoleSlugs, canAddCustomRoles } from "@/lib/auth/roleTiers"
import { RolesManager } from "./RolesManager"

export async function RolesTab() {
  const gw = await gatewaySSR()
  const tier = gw ? await getOrgTierCanonical(gw.orgId) : "owner"
  const allowed = allowedRoleSlugs(tier)
  const roles = (await getOrgRoles()).filter((r) => !r.isSystem || allowed === "all" || allowed.has(r.slug))
  return <RolesManager roles={roles} canAddCustom={canAddCustomRoles(tier)} />
}
