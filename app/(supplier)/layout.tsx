import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SupplierShell } from "./SupplierShell"

export default async function SupplierLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login?role=supplier")

  const { data: contractor } = await supabase
    .from("contractor_view")
    .select("id, first_name, last_name, company_name")
    .eq("auth_user_id", user.id)
    .eq("portal_access_enabled", true)
    .limit(1)
    .single()

  if (!contractor) redirect("/login")

  return <SupplierShell>{children}</SupplierShell>
}
