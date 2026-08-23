/**
 * app/(admin)/admin/subscriptions/page.tsx — Subscription overview + QA state-flip fixture
 *
 * Route:  /admin/subscriptions
 * Auth:   requireAdminAuth (pleks_admin_token cookie)
 * Data:   subscriptions + organisations via service client
 * Notes:  SetStateWidget allows forcing an org into any subscription state for QA.
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateShort } from "@/lib/reports/periods"
import { formatZAR } from "@/lib/constants"
import { SetStateWidget } from "./SetStateWidget"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function AdminSubscriptionsPage() {
  await requireAdminAuth()
  const supabase = await createServiceClient()

  // Expiring trials (within 7 days)
  const sevenDays = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data: expiringTrials, error: expiringTrialsError } = await supabase
    .from("subscriptions")
    .select("org_id, tier, status, trial_ends_at, amount_cents, period_end:current_period_end, organisations(name, founding_agent)")
    .eq("status", "trialing")
    .eq("trial_converted", false)
    .lte("trial_ends_at", sevenDays.toISOString())
    .gte("trial_ends_at", new Date().toISOString())
    .order("trial_ends_at", { ascending: true })
    logQueryError("AdminSubscriptionsPage subscriptions", expiringTrialsError)

  // M-074 — purges held back because the 30-day warning was never established. Red, not amber:
  // an expiring trial resolves itself, this does not. Every row here is an org that is PAST its
  // deletion date and still holding data, and indefinite retention is a POPIA s14 breach in its own
  // right — so this list emptying is the goal, and a row ageing in it is the failure.
  const { data: deferredPurges, error: deferredPurgesError } = await supabase
    .from("subscriptions")
    .select("org_id, purge_deferred_at, purge_deferred_reason, purge_eligible_at, organisations(name)")
    .not("purge_deferred_at", "is", null)
    .order("purge_deferred_at", { ascending: true })
    logQueryError("AdminSubscriptionsPage deferred purges", deferredPurgesError)

  // All subscriptions
  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("org_id, tier, status, amount_cents, period_end:current_period_end, trial_ends_at, organisations(name, founding_agent)")
    .order("created_at", { ascending: false })
    logQueryError("AdminSubscriptionsPage subscriptions", subsError)

  const expiringOrgIds = new Set((expiringTrials ?? []).map((t) => t.org_id))

  const orgOptions = (subs ?? [])
    .filter(s => {
      const org = s.organisations as unknown as { name: string } | null
      return !!org?.name
    })
    .map(s => ({
      orgId: s.org_id,
      orgName: (s.organisations as unknown as { name: string }).name,
      currentStatus: s.status,
    }))

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Subscriptions</h1>

      <SetStateWidget orgs={orgOptions} />

      {/* M-074 — purges held back pending a human. Each reason needs a DIFFERENT response, which is
          why the reason is a column here rather than a single "deferred" flag. */}
      {(deferredPurges ?? []).length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">
              Purges held back — action required ({(deferredPurges ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <p className="mb-3 text-xs text-muted-foreground">
              These orgs reached their deletion date without a confirmed 30-day warning, so the purge
              was held. They are past due for deletion — clearing this list is the goal, not managing it.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2">Org</th>
                  <th className="text-left py-2">Reason</th>
                  <th className="text-left py-2">What to do</th>
                  <th className="text-left py-2">Held since</th>
                </tr>
              </thead>
              <tbody>
                {(deferredPurges ?? []).map((d) => {
                  const org = d.organisations as unknown as { name: string } | null
                  const advice: Record<string, string> = {
                    no_contact:        "No admin contact — find one, then the warning can send",
                    no_warning_logged: "Contact exists but no warning was logged — check the 30-day step",
                    send_failed:       "Warning failed or bounced — investigate delivery to this org",
                    not_delivered:     "Unrecognised delivery status — inspect communication_log",
                  }
                  const reason = d.purge_deferred_reason ?? ""
                  return (
                    <tr key={d.org_id} className="border-b last:border-0">
                      <td className="py-2">{org?.name ?? d.org_id}</td>
                      <td className="py-2"><Badge variant="destructive">{reason || "unknown"}</Badge></td>
                      <td className="py-2 text-muted-foreground">{advice[reason] ?? "Inspect this row manually"}</td>
                      <td className="py-2">{d.purge_deferred_at ? formatDateShort(d.purge_deferred_at) : "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

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
                    (new Date(t.trial_ends_at!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
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
                        variant={s.status === "active" ? "default" : "secondary"}
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
                      {(s.organisations as unknown as { founding_agent: boolean | null } | null)?.founding_agent ? "Yes" : "—"}
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
