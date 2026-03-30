import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Users } from "lucide-react"

export default async function LandlordsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  // Get landlords from the view (joins contacts automatically)
  const { data: landlords } = await supabase
    .from("landlord_view")
    .select("id, contact_id, first_name, last_name, company_name, email, phone, tax_number, bank_name, bank_account, bank_branch")
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  // Get properties linked to landlords
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, landlord_id")
    .eq("org_id", membership.org_id)
    .not("landlord_id", "is", null)
    .is("deleted_at", null)

  const list = landlords || []
  const propsByLandlord = (properties || []).reduce<Record<string, string[]>>((acc, p) => {
    if (p.landlord_id) {
      acc[p.landlord_id] = acc[p.landlord_id] || []
      acc[p.landlord_id].push(p.name)
    }
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Landlords</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{list.length} landlords</p>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8 text-muted-foreground" />}
          title="No landlords yet"
          description="Import contacts or add landlord details on a property's page."
        />
      ) : (
        <div className="space-y-2">
          {list.map((ll) => {
            const name = ll.company_name
              ? ll.company_name
              : `${ll.first_name ?? ""} ${ll.last_name ?? ""}`.trim() || "Unknown"
            const linkedProps = propsByLandlord[ll.id] || []

            return (
              <Card key={ll.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ll.email}{ll.phone ? ` · ${ll.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {linkedProps.map((propName) => (
                      <Badge key={propName} variant="secondary" className="text-[10px]">{propName}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
