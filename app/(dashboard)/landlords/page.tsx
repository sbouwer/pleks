import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AddLandlordForm } from "./AddLandlordForm"

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

  // Get pending landlords
  const { data: pending } = await supabase
    .from("pending_landlords")
    .select("id, full_name, first_name, last_name, email, phone, linked_property_id, properties(name)")
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  // Get linked landlords (from properties.owner_*)
  const { data: linked } = await supabase
    .from("properties")
    .select("id, name, owner_name, owner_email, owner_phone")
    .eq("org_id", membership.org_id)
    .not("owner_email", "is", null)
    .is("deleted_at", null)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl">Landlords</h1>
        <AddLandlordForm orgId={membership.org_id} />
      </div>

      {/* Pending landlords */}
      {pending && pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-amber-500 mb-3">
            Pending — link to properties ({pending.filter((p) => !p.linked_property_id).length})
          </h2>
          <div className="space-y-2">
            {pending.filter((p) => !p.linked_property_id).map((ll) => {
              const name = ll.full_name || `${ll.first_name ?? ""} ${ll.last_name ?? ""}`.trim() || "Unknown"
              return (
                <Card key={ll.id} className="border-amber-500/20">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{ll.email}{ll.phone ? ` · ${ll.phone}` : ""}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400">Pending</Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Linked landlords */}
      {linked && linked.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-3">Linked to properties ({linked.length})</h2>
          <div className="space-y-2">
            {linked.map((prop) => (
              <Card key={prop.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{prop.owner_name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {prop.owner_email}{prop.owner_phone ? ` · ${prop.owner_phone}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{prop.name}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(!pending || pending.length === 0) && (!linked || linked.length === 0) && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No landlords yet. Import contacts or add landlord details on a property&apos;s page.
        </p>
      )}
    </div>
  )
}
