/**
 * app/(demo)/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Guard: if user already has an org, redirect to real dashboard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: membership } = await supabase
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (membership) redirect("/dashboard")
  }

  return <>{children}</>
}
