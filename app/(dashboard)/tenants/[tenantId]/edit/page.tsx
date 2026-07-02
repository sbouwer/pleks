/**
 * app/(dashboard)/tenants/[tenantId]/edit/page.tsx — edit-tenant form page
 *
 * Route:  /tenants/[tenantId]/edit
 * Auth:   gatewaySSR() (agent session + org membership)
 * Data:   tenant_view (org-scoped by org_id), excluding soft-deleted rows
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
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
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: tenant, error: tenantError } = await db
    .from("tenant_view")
    .select("*")
    .eq("id", tenantId)
    .eq("org_id", orgId)
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
