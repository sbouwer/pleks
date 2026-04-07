import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { LandlordsClient } from "./LandlordsClient"
import { AddLandlordForm } from "./AddLandlordForm"

export default async function LandlordsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId, role } = membership
  const supabase = await createClient()

  const [landlordsRes, propertiesRes] = await Promise.all([
    supabase
      .from("landlord_view")
      .select("id, contact_id, entity_type, first_name, last_name, company_name, email, phone")
      .eq("org_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("properties")
      .select("id, name, landlord_id")
      .eq("org_id", orgId)
      .not("landlord_id", "is", null)
      .is("deleted_at", null),
  ])

  const propsByLandlord = (propertiesRes.data || []).reduce<Record<string, string[]>>((acc, p) => {
    if (p.landlord_id) {
      acc[p.landlord_id] = acc[p.landlord_id] || []
      acc[p.landlord_id].push(p.name)
    }
    return acc
  }, {})

  const list = (landlordsRes.data || []).map((l) => ({
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
        <AddLandlordForm orgId={orgId} />
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No landlords yet. Import contacts or add one using the button above.
        </p>
      ) : (
        <LandlordsClient landlords={list} userRole={role} />
      )}
    </div>
  )
}
