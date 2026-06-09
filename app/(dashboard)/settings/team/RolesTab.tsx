/**
 * app/(dashboard)/settings/team/RolesTab.tsx — Roles tab (owner-only) server wrapper
 *
 * Route:  /settings/team?tab=roles
 * Auth:   owner-gated by the page (tab only appears for owners); mutations re-check owner server-side
 * Data:   getOrgRoles (merged built-ins + per-org overrides + custom roles) → RolesManager (client)
 */
import { getOrgRoles } from "@/lib/auth/orgRoles"
import { RolesManager } from "./RolesManager"

export async function RolesTab() {
  const roles = await getOrgRoles()
  return <RolesManager roles={roles} />
}
