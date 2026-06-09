/**
 * lib/auth/capabilities.ts — RBAC capability catalog + built-in role defaults (SSOT)
 *
 * Notes:  Phase 1 of the per-org RBAC build (ADDENDUM_RBAC). Defines the fixed set of domain-level
 *         CAPABILITIES a role can be granted, and the built-in roles (grouped by department) with their
 *         default capability sets. Per-org edits + custom roles layer on top via the org_roles table
 *         (lib/auth/orgRoles.ts). `owner` is implicit-all and never stored/edited here. Enforcement
 *         (can()) is wired in a later phase — this phase only models + resolves.
 */

export interface Capability {
  slug: string
  label: string
  desc: string
}

/** Domain-level capabilities (one per product area). Owner always has all of these. */
export const CAPABILITIES: Capability[] = [
  { slug: "properties",   label: "Properties & units",      desc: "Create and manage properties, buildings and units" },
  { slug: "leases",       label: "Leases",                  desc: "Create and manage leases, renewals and charges" },
  { slug: "tenants",      label: "Tenants",                 desc: "Manage tenants and co-tenants" },
  { slug: "landlords",    label: "Landlords",               desc: "Manage landlords and owners" },
  { slug: "applications", label: "Applications & screening", desc: "Process applications, screening and credit checks" },
  { slug: "maintenance",  label: "Maintenance",             desc: "Manage maintenance requests and contractors" },
  { slug: "inspections",  label: "Inspections",             desc: "Schedule and conduct inspections" },
  { slug: "finance",      label: "Finance & trust",         desc: "Payments, trust account, deposits and arrears" },
  { slug: "reports",      label: "Reports",                 desc: "View and export reports" },
  { slug: "documents",    label: "Documents & templates",   desc: "Manage document and lease templates" },
  { slug: "team",         label: "Team & roles",            desc: "Invite and manage members and roles" },
  { slug: "org",          label: "Organisation settings",   desc: "Branding, hours and workspace configuration" },
  { slug: "billing",      label: "Billing & plan",          desc: "Subscription, invoices and payment" },
]

export const CAPABILITY_SLUGS: string[] = CAPABILITIES.map((c) => c.slug)
/** Owner (and any "all access" role) holds every capability. */
export const ALL_CAPABILITIES: string[] = [...CAPABILITY_SLUGS]

export interface BuiltinRole {
  slug: string
  label: string
  group: string
  /** seed capabilities — the starting set; owners can edit per-org via org_roles */
  defaultCapabilities: string[]
}

/** Department groups, in display order. */
export const ROLE_GROUP_ORDER: string[] = [
  "Management", "Leasing & Applications", "Finance & Accounts", "Operations", "Admin & Support", "HR & Compliance", "IT",
]

/** Built-in roles (the catalogue shown by default), grouped by department, with seed capabilities. */
export const BUILTIN_ROLES: BuiltinRole[] = [
  // Management
  { slug: "property_manager",  label: "Property Manager",  group: "Management", defaultCapabilities: ["properties", "leases", "tenants", "landlords", "applications", "maintenance", "inspections", "reports", "documents"] },
  { slug: "office_manager",    label: "Office Manager",    group: "Management", defaultCapabilities: ["properties", "leases", "tenants", "landlords", "applications", "maintenance", "inspections", "reports", "documents", "team"] },
  { slug: "portfolio_manager", label: "Portfolio Manager", group: "Management", defaultCapabilities: ["properties", "leases", "tenants", "landlords", "applications", "maintenance", "inspections", "reports", "documents"] },
  { slug: "director",          label: "Director",          group: "Management", defaultCapabilities: ["properties", "leases", "tenants", "landlords", "applications", "maintenance", "inspections", "finance", "reports", "documents", "team"] },
  // Leasing & Applications
  { slug: "agent",              label: "Letting Agent",       group: "Leasing & Applications", defaultCapabilities: ["properties", "leases", "tenants", "applications", "reports"] },
  { slug: "leasing_consultant", label: "Leasing Consultant",  group: "Leasing & Applications", defaultCapabilities: ["leases", "tenants", "applications"] },
  { slug: "sales_agent",        label: "Sales Agent",         group: "Leasing & Applications", defaultCapabilities: ["leases", "tenants", "applications"] },
  // Finance & Accounts
  { slug: "accountant",       label: "Accountant",       group: "Finance & Accounts", defaultCapabilities: ["finance", "reports", "billing"] },
  { slug: "bookkeeper",       label: "Bookkeeper",       group: "Finance & Accounts", defaultCapabilities: ["finance", "reports"] },
  { slug: "account_manager",  label: "Account Manager",  group: "Finance & Accounts", defaultCapabilities: ["finance", "reports"] },
  { slug: "accounts_payable", label: "Accounts Payable", group: "Finance & Accounts", defaultCapabilities: ["finance"] },
  { slug: "trust_accountant", label: "Trust Accountant", group: "Finance & Accounts", defaultCapabilities: ["finance", "reports"] },
  // Operations
  { slug: "maintenance_manager", label: "Maintenance Manager", group: "Operations", defaultCapabilities: ["maintenance", "inspections", "properties"] },
  { slug: "inspection_manager",  label: "Inspection Manager",  group: "Operations", defaultCapabilities: ["inspections", "properties"] },
  { slug: "facilities_manager",  label: "Facilities Manager",  group: "Operations", defaultCapabilities: ["maintenance", "inspections", "properties"] },
  // Admin & Support
  { slug: "admin_assistant", label: "Admin Assistant", group: "Admin & Support", defaultCapabilities: ["applications", "tenants", "documents"] },
  { slug: "receptionist",    label: "Receptionist",    group: "Admin & Support", defaultCapabilities: ["applications", "tenants"] },
  // HR & Compliance
  { slug: "hr_manager",         label: "HR Manager",         group: "HR & Compliance", defaultCapabilities: ["team"] },
  { slug: "compliance_officer", label: "Compliance Officer", group: "HR & Compliance", defaultCapabilities: ["reports", "documents"] },
  // IT
  { slug: "it_manager",    label: "IT Manager",    group: "IT", defaultCapabilities: ["org"] },
  { slug: "it_department", label: "IT Department", group: "IT", defaultCapabilities: ["org"] },
]

export const BUILTIN_ROLE_BY_SLUG: Record<string, BuiltinRole> =
  Object.fromEntries(BUILTIN_ROLES.map((r) => [r.slug, r]))
