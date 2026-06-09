/**
 * lib/auth/roleTiers.ts — which roles each subscription tier exposes (ADDENDUM_RBAC tier gating)
 *
 * Notes:  Built-in role availability ramps with tier; custom roles are Firm/Bespoke only. Editing a role's
 *         capabilities is available on every tier. Custom roles that already exist (e.g. after a downgrade)
 *         stay visible + editable everywhere — only ADDING new ones is tier-gated. The Roles tab filters
 *         built-ins by this map and shows "Add role" only when canAddCustom; saveOrgRole re-checks server-side.
 */
import { type Tier } from "@/lib/constants"

const OWNER_ROLES = ["property_manager", "admin_assistant", "it_manager"]
const STEWARD_ROLES = [...OWNER_ROLES, "office_manager", "agent", "accountant", "maintenance_manager"]
const GROWTH_ROLES = [
  "property_manager", "office_manager", "agent", "leasing_consultant", "accountant", "bookkeeper",
  "maintenance_manager", "inspection_manager", "admin_assistant", "receptionist", "compliance_officer",
]

export const TIER_ROLE_ACCESS: Record<Tier, { roles: string[] | "all"; canAddCustom: boolean }> = {
  owner:     { roles: OWNER_ROLES,   canAddCustom: false },
  steward:   { roles: STEWARD_ROLES, canAddCustom: false },
  growth:    { roles: GROWTH_ROLES,  canAddCustom: false },
  portfolio: { roles: "all",         canAddCustom: false },
  firm:      { roles: "all",         canAddCustom: true },
  bespoke:   { roles: "all",         canAddCustom: true },
}

/** Allowed built-in role slugs for a tier — "all" or a lookup Set. */
export function allowedRoleSlugs(tier: Tier): "all" | Set<string> {
  const cfg = TIER_ROLE_ACCESS[tier] ?? TIER_ROLE_ACCESS.owner
  return cfg.roles === "all" ? "all" : new Set(cfg.roles)
}

export function canAddCustomRoles(tier: Tier): boolean {
  return (TIER_ROLE_ACCESS[tier] ?? TIER_ROLE_ACCESS.owner).canAddCustom
}

/** Should this role show on the tier? Built-ins are gated; custom roles always show where they exist. */
export function isRoleVisibleForTier(tier: Tier, slug: string, isSystem: boolean): boolean {
  if (!isSystem) return true
  const allowed = allowedRoleSlugs(tier)
  return allowed === "all" || allowed.has(slug)
}
