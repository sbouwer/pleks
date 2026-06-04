/**
 * app/(dashboard)/tenants/[tenantId]/edit/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { updateTenant } from "@/lib/actions/tenants"
import { TenantEditForm } from "./TenantEditForm"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: tenant, error: tenantError } = await supabase
    .from("tenant_view")
    .select("*")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .single()
    logQueryError("EditTenantPage tenant_view", tenantError)

  if (!tenant) notFound()

  const boundAction = updateTenant.bind(null, tenantId)

  return (
    <div className="max-w-xl">
      <BackLink href={`/tenants/${tenantId}`} label="Back to tenant" />
      <h1 className="font-heading text-3xl mb-6">Edit Tenant</h1>
      <TenantEditForm tenant={tenant} action={boundAction} />
    </div>
  )
}
