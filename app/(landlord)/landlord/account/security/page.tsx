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
