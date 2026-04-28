import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PortalSecurityView } from "@/components/auth/PortalSecurityView"

export const metadata = { title: "Security" }

export default async function SupplierSecurityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totpCount = factors?.totp?.length ?? 0

  return <PortalSecurityView userId={user.id} totpCount={totpCount} role="supplier" />
}
