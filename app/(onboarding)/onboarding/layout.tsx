/**
 * app/(onboarding)/onboarding/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PublicThemeProvider } from "../../(public)/PublicThemeProvider"
import { PublicNav } from "../../(public)/PublicNav"
import "../../(public)/public.css"

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const service = await createServiceClient()
    const { data: membership } = await service
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (membership) redirect("/dashboard")
  }

  return (
    <PublicThemeProvider>
      <PublicNav />
      <div style={{ minHeight: "calc(100vh - 64px)", display: "flex", justifyContent: "center", padding: "56px 20px 80px" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          {children}
        </div>
      </div>
    </PublicThemeProvider>
  )
}
