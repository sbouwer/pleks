import { cookies } from "next/headers"
import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SessionRole } from "@/lib/auth/roles"
import { ROLE_DEFAULT_ROUTES } from "@/lib/auth/roles"

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
  let hasMultiple = false

  try {
    const raw = cookieStore.get("pleks_active_role")?.value
    if (raw) {
      activeRole = (JSON.parse(raw) as { role?: string }).role ?? null
    }
    const availRaw = cookieStore.get("pleks_available_roles")?.value
    if (availRaw) {
      hasMultiple = (JSON.parse(availRaw) as unknown[]).length > 1
    }
  } catch { /* cookies malformed */ }

  const workspaceHome = activeRole
    ? ROLE_DEFAULT_ROUTES[activeRole as SessionRole] ?? "/dashboard"
    : "/dashboard"

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
        {hasMultiple && (
          <Button render={<Link href="/select-role" />}>Switch workspace</Button>
        )}
        <Button variant={hasMultiple ? "outline" : "default"} render={<Link href={workspaceHome} />}>
          Go to my workspace
        </Button>
        <Button variant="ghost" render={<Link href="/login" />}>Sign out</Button>
      </div>
    </div>
  )
}
