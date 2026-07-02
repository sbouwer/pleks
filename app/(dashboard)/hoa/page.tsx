/**
 * app/(dashboard)/hoa/page.tsx — HOA entity list (server)
 *
 * Route:  /hoa
 * Auth:   gatewaySSR() (agent session + org membership); org-type guard redirects non-HOA orgs to /dashboard; firm-tier gate shows upgrade prompt
 * Data:   hoa_entities, subscriptions — org-scoped via gatewaySSR db
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { getCurrentOrgCapabilities } from "@/lib/auth/server"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { InlineLink } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function HOAListPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/onboarding")
  const { db, orgId } = gw

  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasHOA) redirect("/dashboard")

  // Firm tier check
  const { data: sub, error: subError } = await db
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()
    logQueryError("HOAListPage subscriptions", subError)

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
            <InlineLink href="/settings/subscription" withArrow={false} className="mt-4 inline-flex">
              Upgrade to Firm
            </InlineLink>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: hoaEntities, error: hoaEntitiesError } = await db
    .from("hoa_entities")
    .select(`
      id, name, entity_type, is_active,
      csos_registration_number, csos_annual_return_due,
      properties(name, address_line1)
    `)
    .eq("org_id", orgId)
    .order("name")
    logQueryError("HOAListPage hoa_entities", hoaEntitiesError)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl">HOA Management</h1>
        <InlineLink href="/hoa/new" withArrow={false}>New HOA Entity</InlineLink>
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
                      <InlineLink href={`/hoa/${hoa.id}`} withArrow={false}>
                        Manage
                      </InlineLink>
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
