/**
 * app/(supplier)/layout.tsx — Supplier portal root layout — auth gate and shell
 *
 * Route:  /supplier/*
 * Auth:   Supabase auth + contractor_view.portal_access_enabled check
 * Data:   contractor_view via Supabase client
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SupplierShell } from "./SupplierShell"
import { setSentryUser } from "@/lib/observability/user-context"

export default async function SupplierLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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

  setSentryUser({ id: user.id, role: "supplier", scope_id: contractor.id })

  return <SupplierShell>{children}</SupplierShell>
}
