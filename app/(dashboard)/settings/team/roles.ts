/**
 * app/(dashboard)/settings/team/roles.ts — invitable team roles (shared)
 *
 * Notes:  The roles a NEW member may be invited as — the system slugs allowed by the user_orgs.role
 *         CHECK minus 'owner' (owner is only reachable via ownership transfer; admin is the is_admin
 *         boolean, not a role). Mirrors the server allowlist in app/api/team/invite/route.ts. The richer
 *         label set + custom roles for EDITING an existing member live in TeamSettingsClient (RoleCombobox).
 */
export const INVITABLE_ROLES: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "property_manager", label: "Property Manager" },
  { slug: "agent", label: "Letting Agent" },
  { slug: "accountant", label: "Accountant" },
  { slug: "maintenance_manager", label: "Maintenance Manager" },
]
