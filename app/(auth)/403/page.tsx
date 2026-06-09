/**
 * app/(auth)/403/page.tsx — forbidden page shown when role doesn't match route
 *
 * Route:  /403
 * Auth:   public (no session required; shown after proxy gate)
 * Notes:  Routes back to /auth/resolver which owns all workspace routing decisions.
 *         Reads role from pleks_org (agent class) or portal_class from pleks_has_org.
 *         Does not read ROLE_DEFAULT_ROUTES — resolver handles destination logic.
 */
import { cookies } from "next/headers"
import { ShieldAlert } from "lucide-react"
import { ErrorShell, ErrorAction } from "@/components/layout/ErrorShell"
import { BUILTIN_ROLE_BY_SLUG } from "@/lib/auth/capabilities"

export const metadata = { title: "Not available here" }

const ROLE_LABELS: Record<string, string> = {
  tenant:              "Tenant",
  landlord:            "Landlord",
  supplier:            "Supplier",
  contractor:          "Supplier",
  owner:               "Owner",
  property_manager:    "Property manager",
  agent:               "Agent",
  accountant:          "Accountant",
  maintenance_manager: "Maintenance manager",
}

export default async function ForbiddenPage() {
  const cookieStore = await cookies()
  let activeRole: string | null = null

  try {
    const orgRaw = cookieStore.get("pleks_org")?.value
    if (orgRaw) {
      activeRole = (JSON.parse(orgRaw) as { role?: string }).role ?? null
    }
    if (!activeRole) {
      const hasOrgRaw = cookieStore.get("pleks_has_org")?.value
      if (hasOrgRaw) {
        activeRole = (JSON.parse(hasOrgRaw) as { portal_class?: string }).portal_class ?? null
      }
    }
  } catch { /* cookies malformed */ }

  const roleLabel = activeRole
    ? (BUILTIN_ROLE_BY_SLUG[activeRole]?.label ?? ROLE_LABELS[activeRole] ?? activeRole)
    : null

  return (
    <ErrorShell
      icon={<ShieldAlert className="h-10 w-10" aria-hidden="true" />}
      title="Not available here"
      message={roleLabel
        ? `This page isn't available in your current workspace. You're signed in as ${roleLabel}.`
        : "This page isn't available in your current workspace."}
    >
      <ErrorAction href="/auth/resolver">Go to my workspace</ErrorAction>
      <ErrorAction href="/login" ghost>Sign out</ErrorAction>
    </ErrorShell>
  )
}
