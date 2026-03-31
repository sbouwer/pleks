import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AddContractorForm } from "./AddContractorForm"

export default async function ContractorsPage() {
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

  const { data: contractors } = await supabase
    .from("contractor_view")
    .select("id, first_name, last_name, company_name, email, phone, is_active")
    .eq("org_id", membership.org_id)
    .order("created_at", { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Contractors</h1>
          <p className="text-sm text-muted-foreground">{contractors?.length ?? 0} contractors</p>
        </div>
        <AddContractorForm orgId={membership.org_id} />
      </div>

      {(!contractors || contractors.length === 0) ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No contractors yet. Import contacts or add one using the button above.
        </p>
      ) : (
        <div className="space-y-2">
          {contractors.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{c.company_name || `${c.first_name} ${c.last_name}`.trim()}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.email}{c.phone ? ` · ${c.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.supplier_type && <Badge variant="secondary" className="text-[10px]">{c.supplier_type}</Badge>}
                  <Badge variant="secondary" className={`text-[10px] ${c.is_active ? "bg-green-500/10 text-green-400" : "bg-surface-elevated"}`}>
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
