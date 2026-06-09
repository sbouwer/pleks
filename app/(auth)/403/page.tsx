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
import { FocusShell } from "@/components/layout/FocusShell"
import { AccentBracket } from "@/components/ui/AccentBracket"
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

  // Same branded shell + card chrome as the login screen (warm backdrop, wordmark, amber doorsill, dot).
  return (
    <FocusShell>
      <div className="fs-panel" style={{ maxWidth: 400, textAlign: "center" }}>
        <span className="fs-knob" aria-hidden="true" />
        <span className="pub-wordmark" aria-label="Pleks" style={{ justifyContent: "center", fontSize: 22, display: "inline-flex" }}>
          <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
        </span>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <ShieldAlert className="h-10 w-10 text-muted-foreground" style={{ marginBottom: 12 }} aria-hidden="true" />
          <h1 className="text-xl font-semibold" style={{ marginBottom: 6 }}>Not available here</h1>
          <p className="fs-subhead" style={{ maxWidth: 300, margin: "0 auto" }}>
            {roleLabel
              ? `This page isn't available in your current workspace. You're signed in as ${roleLabel}.`
              : "This page isn't available in your current workspace."}
          </p>
        </div>

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/auth/resolver" className="fs-cta">
            <span className="fs-cta-bar" aria-hidden="true" />
            <span className="fs-cta-label">Go to my workspace</span>
            <span className="fs-cta-arrow" aria-hidden="true">→</span>
          </Link>
          <Link href="/login" className="fs-cta-ghost">Sign out</Link>
        </div>
      </div>
    </FocusShell>
  )
}
