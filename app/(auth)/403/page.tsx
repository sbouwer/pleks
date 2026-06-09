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

  // Mirrors the login modal: stripped background + a centred card, so this reads as part of the app.
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
      <div
        style={{
          background: "var(--surface-base, #fff)",
          borderRadius: 10,
          boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
          maxWidth: 448,
          width: "100%",
          padding: "36px 36px 32px",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <ShieldAlert className="mb-6 h-12 w-12 text-muted-foreground" />
          <h1 className="mb-2 font-heading text-2xl">Not available here</h1>
          <p className="mb-8 max-w-xs text-sm text-muted-foreground">
            {roleLabel
              ? `This page isn't available in your current workspace. You're signed in as ${roleLabel}.`
              : "This page isn't available in your current workspace."}
          </p>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <ActionButton asChild tone="primary"><Link href="/auth/resolver">Go to my workspace</Link></ActionButton>
            <ActionButton asChild tone="secondary"><Link href="/login">Sign out</Link></ActionButton>
          </div>
        </div>
      </div>
    </div>
  )
}
