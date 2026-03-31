import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LandlordsClient } from "./LandlordsClient"
import { AddLandlordForm } from "./AddLandlordForm"

export default async function LandlordsPage() {
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

  const { data: landlords } = await supabase
    .from("landlord_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone")
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, landlord_id")
    .eq("org_id", membership.org_id)
    .not("landlord_id", "is", null)
    .is("deleted_at", null)

  const propsByLandlord = (properties || []).reduce<Record<string, string[]>>((acc, p) => {
    if (p.landlord_id) {
      acc[p.landlord_id] = acc[p.landlord_id] || []
      acc[p.landlord_id].push(p.name)
    }
    return acc
  }, {})

  const list = (landlords || []).map((l) => ({
    ...l,
    properties: propsByLandlord[l.id] || [],
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Landlords</h1>
          <p className="text-sm text-muted-foreground">{list.length} landlords</p>
        </div>
        <AddLandlordForm orgId={membership.org_id} />
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No landlords yet. Import contacts or add one using the button above.
        </p>
      ) : (
        <LandlordsClient landlords={list} userRole={membership.role} />
      )}
    </div>
  )
}
