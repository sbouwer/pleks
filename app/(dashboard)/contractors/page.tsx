import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ContractorsClient, AddContractorButton } from "./ContractorsClient"

export default async function ContractorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const { data: contractors } = await supabase
    .from("contractor_view")
    .select("id, contact_id, first_name, last_name, company_name, email, phone, specialities, is_active")
    .eq("org_id", membership.org_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Contractors</h1>
          <p className="text-sm text-muted-foreground">{contractors?.length ?? 0} contractors</p>
        </div>
        <AddContractorButton orgId={membership.org_id} />
      </div>

      {(!contractors || contractors.length === 0) ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No contractors yet. Import contacts or add one using the button above.
        </p>
      ) : (
        <ContractorsClient
          contractors={contractors}
          userRole={membership.role}
          orgId={membership.org_id}
        />
      )}
    </div>
  )
}
