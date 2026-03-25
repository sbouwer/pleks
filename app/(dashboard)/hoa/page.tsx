import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default async function HOAListPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  // Firm tier check
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  if (sub?.tier !== "firm") {
    return (
      <div>
        <h1 className="font-heading text-3xl mb-6">HOA Management</h1>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              HOA management is available on the Firm tier. Upgrade to access body
              corporate, levy management, AGM tools, and reserve fund tracking.
            </p>
            <Button className="mt-4" render={<Link href="/settings/billing" />}>
              Upgrade to Firm
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: hoaEntities } = await supabase
    .from("hoa_entities")
    .select(`
      id, name, entity_type, is_active,
      csos_registration_number, csos_annual_return_due,
      properties(name, address_line1)
    `)
    .eq("org_id", orgId)
    .order("name")

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl">HOA Management</h1>
        <Button render={<Link href="/hoa/new" />}>New HOA Entity</Button>
      </div>

      {(hoaEntities ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              No HOA or body corporate entities set up yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(hoaEntities ?? []).map((hoa) => {
            const prop = hoa.properties as unknown as { name: string; address_line1: string } | null
            const entityLabels: Record<string, string> = {
              body_corporate: "Body Corporate",
              hoa: "HOA",
              share_block: "Share Block",
              poa: "POA",
            }
            return (
              <Card key={hoa.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link href={`/hoa/${hoa.id}`} className="font-semibold hover:text-brand transition-colors">
                        {hoa.name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {prop?.name ?? prop?.address_line1 ?? ""} — {entityLabels[hoa.entity_type] ?? hoa.entity_type}
                      </p>
                      {hoa.csos_registration_number && (
                        <p className="text-xs text-muted-foreground">CSOS: {hoa.csos_registration_number}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={hoa.is_active ? "default" : "secondary"}>
                        {hoa.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button variant="ghost" size="sm" render={<Link href={`/hoa/${hoa.id}`} />}>
                        Manage
                      </Button>
                    </div>
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
