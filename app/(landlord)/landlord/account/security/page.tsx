/**
 * app/(landlord)/landlord/account/security/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { createClient } from "@/lib/supabase/server"
import { PortalSecurityView } from "@/components/auth/PortalSecurityView"

export const metadata = { title: "Security" }

export default async function LandlordSecurityPage() {
  const session = await getLandlordSession()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totpCount = factors?.totp?.length ?? 0

  return <PortalSecurityView userId={user.id} totpCount={totpCount} role="landlord" />
}
