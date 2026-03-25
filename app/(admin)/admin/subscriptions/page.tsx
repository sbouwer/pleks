import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateShort } from "@/lib/reports/periods"
import { formatZAR } from "@/lib/constants"

export default async function AdminSubscriptionsPage() {
  await requireAdminAuth()
  const supabase = await createServiceClient()

  // Expiring trials (within 7 days)
  const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const { data: expiringTrials } = await supabase
    .from("subscriptions")
    .select("org_id, tier, status, trial_ends_at, founding_agent, amount_cents, period_end, organisations(name)")
    .eq("status", "trialing")
    .eq("trial_converted", false)
    .lte("trial_ends_at", sevenDays.toISOString())
    .gte("trial_ends_at", new Date().toISOString())
    .order("trial_ends_at", { ascending: true })

  // All subscriptions
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("org_id, tier, status, amount_cents, period_end, trial_ends_at, founding_agent, organisations(name)")
    .order("created_at", { ascending: false })

  const expiringOrgIds = new Set((expiringTrials ?? []).map((t) => t.org_id))

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Subscriptions</h1>

      {/* Expiring trials warning */}
      {(expiringTrials ?? []).length > 0 && (
        <Card className="border-amber-300/50">
          <CardHeader>
            <CardTitle className="text-sm text-amber-600">
              Trials expiring within 7 days ({(expiringTrials ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2">Org</th>
                  <th className="text-left py-2">Tier</th>
                  <th className="text-left py-2">Expires</th>
                  <th className="text-right py-2">Days left</th>
                </tr>
              </thead>
              <tbody>
                {(expiringTrials ?? []).map((t) => {
                  const org = t.organisations as unknown as { name: string } | null
                  const days = Math.ceil(
                    (new Date(t.trial_ends_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  )
                  return (
                    <tr key={t.org_id} className="border-b border-amber-200/50 bg-amber-50/50">
                      <td className="py-2">{org?.name ?? t.org_id}</td>
                      <td className="py-2 capitalize text-xs">{t.tier}</td>
                      <td className="py-2 text-xs">
                        {formatDateShort(new Date(t.trial_ends_at!))}
                      </td>
                      <td className="text-right py-2">
                        <Badge variant="secondary">{days}d</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* All subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All subscriptions ({(subs ?? []).length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2">Org name</th>
                <th className="text-left py-2">Tier</th>
                <th className="text-left py-2">Status</th>
                <th className="text-right py-2">Amount</th>
                <th className="text-left py-2">Period end</th>
                <th className="text-center py-2">Trial?</th>
                <th className="text-center py-2">Founding?</th>
              </tr>
            </thead>
            <tbody>
              {(subs ?? []).map((s) => {
                const org = s.organisations as unknown as { name: string } | null
                const isExpiring = expiringOrgIds.has(s.org_id)
                return (
                  <tr
                    key={s.org_id}
                    className={
                      isExpiring
                        ? "border-b border-amber-200/50 bg-amber-50/50"
                        : "border-b border-border/50"
                    }
                  >
                    <td className="py-2">{org?.name ?? s.org_id}</td>
                    <td className="py-2 capitalize text-xs">{s.tier}</td>
                    <td className="py-2 text-xs">
                      <Badge
                        variant={
                          s.status === "active"
                            ? "default"
                            : s.status === "trialing"
                              ? "secondary"
                              : "secondary"
                        }
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-xs text-right">
                      {s.amount_cents != null ? formatZAR(s.amount_cents) : "—"}
                    </td>
                    <td className="py-2 text-xs">
                      {s.period_end ? formatDateShort(new Date(s.period_end)) : "—"}
                    </td>
                    <td className="text-center py-2">
                      {s.status === "trialing" ? "Yes" : "—"}
                    </td>
                    <td className="text-center py-2">
                      {s.founding_agent ? "Yes" : "—"}
                    </td>
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
