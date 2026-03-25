import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateShort } from "@/lib/reports/periods"
import { formatZAR } from "@/lib/constants"
import { AdminOrgActions } from "./AdminOrgActions"

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  await requireAdminAuth()
  const { orgId } = await params
  const supabase = await createServiceClient()

  const [orgRes, subRes, membersRes, auditRes] = await Promise.all([
    supabase.from("organisations").select("*").eq("id", orgId).single(),
    supabase.from("subscriptions").select("*").eq("org_id", orgId).single(),
    supabase
      .from("user_orgs")
      .select("role, created_at, user_profiles(full_name, email)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_log")
      .select("id, action, table_name, new_values, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  const org = orgRes.data
  const sub = subRes.data
  const members = membersRes.data ?? []
  const auditEntries = auditRes.data ?? []

  if (!org) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl">Organisation not found</h1>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">{org.name}</h1>

      {/* Org details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Organisation details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd>{org.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd>{org.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Type</dt>
              <dd className="capitalize">{org.type}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Address</dt>
              <dd>{org.address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Registration number</dt>
              <dd>{org.reg_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">VAT number</dt>
              <dd>{org.vat_number ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {sub ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Tier</dt>
                <dd className="capitalize">{sub.tier}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                    {sub.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Period end</dt>
                <dd>{sub.period_end ? formatDateShort(new Date(sub.period_end)) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Founding agent</dt>
                <dd>{sub.founding_agent ? "Yes" : "No"}</dd>
              </div>
              {sub.founding_agent && (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">Founding agent since</dt>
                    <dd>
                      {sub.founding_agent_since
                        ? formatDateShort(new Date(sub.founding_agent_since))
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Founding agent expires</dt>
                    <dd>
                      {sub.founding_agent_expires_at
                        ? formatDateShort(new Date(sub.founding_agent_expires_at))
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Founding agent price</dt>
                    <dd>
                      {sub.founding_agent_price_cents != null
                        ? formatZAR(sub.founding_agent_price_cents)
                        : "—"}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No subscription record</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminOrgActions
            orgId={orgId}
            currentTier={sub?.tier ?? "owner"}
            currentStatus={sub?.status ?? "active"}
            isFoundingAgent={sub?.founding_agent ?? false}
            trialEndsAt={sub?.trial_ends_at ?? null}
          />
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Users ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Role</th>
                <th className="text-left py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const profile = m.user_profiles as unknown as {
                  full_name: string | null
                  email: string | null
                } | null
                return (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2">{profile?.full_name ?? "—"}</td>
                    <td className="py-2">{profile?.email ?? "—"}</td>
                    <td className="py-2 capitalize text-xs">{m.role}</td>
                    <td className="py-2 text-xs">{formatDateShort(new Date(m.created_at))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Audit log (last 20)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2">Action</th>
                <th className="text-left py-2">Table</th>
                <th className="text-left py-2">Details</th>
                <th className="text-left py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50">
                  <td className="py-2 text-xs">
                    <Badge variant="secondary">{entry.action}</Badge>
                  </td>
                  <td className="py-2 text-xs">{entry.table_name}</td>
                  <td className="py-2 text-xs max-w-xs truncate">
                    {entry.new_values
                      ? JSON.stringify(entry.new_values).slice(0, 120)
                      : "—"}
                  </td>
                  <td className="py-2 text-xs">
                    {formatDateShort(new Date(entry.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
