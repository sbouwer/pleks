/**
 * app/(auth)/select-role/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveUserRoles, ROLE_DEFAULT_ROUTES, type SessionRole } from "@/lib/auth/roles"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"
import { RoleSelectorClient } from "@/components/role-selector/RoleSelectorClient"

export const metadata = { title: "Select workspace" }

const ROLE_ICONS: Record<string, string> = {
  tenant:              "🏠",
  landlord:            "🏢",
  supplier:            "🔧",
  contractor:          "🔧",
  owner:               "⚙️",
  property_manager:    "📋",
  agent:               "👤",
  accountant:          "📊",
  maintenance_manager: "🔨",
}

export default async function SelectRolePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const memberships = await resolveUserRoles(user.id)

  if (memberships.length === 0) redirect("/onboarding")

  if (memberships.length === 1) {
    const m = memberships[0]
    const cookieStore = await cookies()
    cookieStore.set("pleks_active_role", JSON.stringify({
      role: m.role, scope_id: m.scope_id, org_id: m.org_id,
    }), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
    cookieStore.set("pleks_available_roles", JSON.stringify(memberships), {
      ...AUTH_COOKIE_OPTS, maxAge: 60 * 5,
    })
    redirect(ROLE_DEFAULT_ROUTES[m.role as SessionRole] ?? "/dashboard")
  }

  const displayName = user.user_metadata?.full_name
    ?? user.user_metadata?.first_name
    ?? user.email?.split("@")[0]
    ?? "there"

  const withIcons = memberships.map(m => ({
    ...m,
    icon: ROLE_ICONS[m.role] ?? "👤",
  }))

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-16">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl mb-2">Welcome back, {displayName}</h1>
          <p className="text-muted-foreground text-sm">
            You have access to multiple workspaces. Pick one to continue.
          </p>
        </div>
        <RoleSelectorClient memberships={withIcons} />
      </div>
    </div>
  )
}
