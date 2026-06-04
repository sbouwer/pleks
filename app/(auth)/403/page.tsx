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
import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"

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

  const roleLabel = activeRole ? (ROLE_LABELS[activeRole] ?? activeRole) : null

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-24 text-center">
      <ShieldAlert className="h-12 w-12 text-muted-foreground mb-6" />
      <h1 className="font-heading text-3xl mb-2">Not available here</h1>
      <p className="text-muted-foreground text-sm max-w-xs mb-8">
        {roleLabel
          ? `This page isn't available in your current workspace. You're signed in as ${roleLabel}.`
          : "This page isn't available in your current workspace."}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <ActionButton asChild tone="primary"><Link href="/auth/resolver">Go to my workspace</Link></ActionButton>
        <ActionButton asChild tone="secondary"><Link href="/login">Sign out</Link></ActionButton>
      </div>
    </div>
  )
}
