import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { updateTenant } from "@/lib/actions/tenants"
import { TenantEditForm } from "./TenantEditForm"

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: tenant } = await supabase
    .from("tenant_view")
    .select("*")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .single()

  if (!tenant) notFound()

  const boundAction = updateTenant.bind(null, tenantId)

  return (
    <div className="max-w-xl">
      <h1 className="font-heading text-3xl mb-6">Edit Tenant</h1>
      <TenantEditForm tenant={tenant} action={boundAction} />
    </div>
  )
}
