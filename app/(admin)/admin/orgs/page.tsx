import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateShort } from "@/lib/reports/periods"
import Link from "next/link"

export default async function AdminOrgsPage() {
  await requireAdminAuth()
  const supabase = await createServiceClient()

  const { data: orgs } = await supabase
    .from("organisations")
    .select("id, name, type, founding_agent, created_at")
    .order("created_at", { ascending: false })

  // Get subscription data for all orgs
  const orgIds = (orgs ?? []).map((o) => o.id)
  const { data: subs } = orgIds.length > 0
    ? await supabase.from("subscriptions").select("org_id, tier, status").in("org_id", orgIds)
    : { data: [] }
  const subByOrg = new Map((subs ?? []).map((s) => [s.org_id, s]))

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Organisations</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            All organisations ({(orgs ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Tier</th>
                <th className="text-left py-2">Status</th>
                <th className="text-center py-2">Founding?</th>
                <th className="text-left py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {(orgs ?? []).map((o) => {
                const sub = subByOrg.get(o.id)
                return (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="py-2">
                      <Link href={`/admin/orgs/${o.id}`} className="hover:text-brand underline-offset-4 hover:underline">
                        {o.name}
                      </Link>
                    </td>
                    <td className="py-2 capitalize text-xs">{o.type}</td>
                    <td className="py-2 capitalize text-xs">{sub?.tier ?? "—"}</td>
                    <td className="py-2 text-xs">
                      {sub?.status ? (
                        <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                          {sub.status}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-center py-2">{o.founding_agent ? "Yes" : "—"}</td>
                    <td className="py-2 text-xs">{formatDateShort(new Date(o.created_at))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
