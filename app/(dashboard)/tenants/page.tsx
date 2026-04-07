import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { TenantsClient } from "./TenantsClient"

export default async function TenantsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const { data: tenants } = await supabase
    .from("tenant_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone")
    .eq("org_id", orgId)
    .is("deleted_at", null)

  const list = tenants || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Tenants</h1>
          <p className="text-sm text-muted-foreground">{list.length} tenants</p>
        </div>
        <Button render={<Link href="/tenants/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Add Tenant
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No tenants yet. Import contacts or add one using the button above.
        </p>
      ) : (
        <TenantsClient tenants={list} userRole={membership.role} />
      )}
    </div>
  )
}
