import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateShort } from "@/lib/reports/periods"
import { PrimeRateWidget } from "./PrimeRateWidget"

export default async function AdminOverviewPage() {
  await requireAdminAuth()
  const supabase = await createServiceClient()

  const [orgsRes, paidRes, trialingRes, waitlistRes] = await Promise.all([
    supabase.from("organisations").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").neq("tier", "owner"),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
    supabase.from("waitlist").select("id", { count: "exact", head: true }),
  ])

  // Recent orgs
  const { data: recentOrgs } = await supabase
    .from("organisations")
    .select("id, name, type, founding_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(10)

  // Get subscription info for recent orgs
  const orgIds = (recentOrgs ?? []).map((o) => o.id)
  const { data: orgSubs } = orgIds.length > 0
    ? await supabase.from("subscriptions").select("org_id, tier, status").in("org_id", orgIds)
    : { data: [] }
  const subByOrg = new Map((orgSubs ?? []).map((s) => [s.org_id, s]))

  // Expiring trials
  const sevenDays = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data: expiringTrials } = await supabase
    .from("subscriptions")
    .select("org_id, trial_ends_at, organisations(name)")
    .eq("status", "trialing")
    .eq("trial_converted", false)
    .lte("trial_ends_at", sevenDays.toISOString())
    .gte("trial_ends_at", new Date().toISOString())

  // Current prime rate
  const { data: primeRate } = await supabase
    .from("prime_rates")
    .select("rate_percent, effective_date")
    .order("effective_date", { ascending: false })
    .limit(1)
    .single()

  // Recent waitlist
  const { data: recentWaitlist } = await supabase
    .from("waitlist")
    .select("email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Organisations</p><p className="font-heading text-2xl">{orgsRes.count ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Paid subscribers</p><p className="font-heading text-2xl">{paidRes.count ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Trialing</p><p className="font-heading text-2xl">{trialingRes.count ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Waitlist</p><p className="font-heading text-2xl">{waitlistRes.count ?? 0}</p></CardContent></Card>
        <PrimeRateWidget
          currentRate={primeRate?.rate_percent ?? 11.25}
          effectiveSince={primeRate?.effective_date ?? "2024-01-01"}
        />
      </div>

      {/* Expiring trials */}
      {(expiringTrials ?? []).length > 0 && (
        <Card className="border-amber-300/50">
          <CardHeader><CardTitle className="text-sm text-amber-600">Trials expiring within 7 days</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2">Org</th><th className="text-left py-2">Ends</th><th className="text-right py-2">Days</th></tr></thead>
              <tbody>
                {(expiringTrials ?? []).map((t) => {
                  const org = t.organisations as unknown as { name: string } | null
                  const days = Math.ceil((new Date(t.trial_ends_at!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  return (
                    <tr key={t.org_id} className="border-b border-border/50">
                      <td className="py-2">{org?.name ?? t.org_id}</td>
                      <td className="py-2">{formatDateShort(new Date(t.trial_ends_at!))}</td>
                      <td className="text-right py-2"><Badge variant="secondary">{days}d</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Recent orgs */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Recent signups</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2">Name</th><th className="text-left py-2">Type</th><th className="text-left py-2">Tier</th><th className="text-left py-2">Status</th><th className="text-center py-2">Founding</th><th className="text-left py-2">Created</th></tr></thead>
            <tbody>
              {(recentOrgs ?? []).map((o) => {
                const sub = subByOrg.get(o.id)
                return (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="py-2"><a href={`/admin/orgs/${o.id}`} className="hover:text-brand">{o.name}</a></td>
                    <td className="py-2 capitalize text-xs">{o.type}</td>
                    <td className="py-2 capitalize text-xs">{sub?.tier ?? "—"}</td>
                    <td className="py-2 text-xs">{sub?.status ?? "—"}</td>
                    <td className="text-center py-2">{o.founding_agent ? "Yes" : "—"}</td>
                    <td className="py-2 text-xs">{formatDateShort(new Date(o.created_at))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Recent waitlist */}
      {(recentWaitlist ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent waitlist</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2">Email</th><th className="text-left py-2">Role</th><th className="text-left py-2">Signed up</th></tr></thead>
              <tbody>
                {(recentWaitlist ?? []).map((w, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2">{w.email}</td>
                    <td className="py-2 capitalize text-xs">{w.role ?? "—"}</td>
                    <td className="py-2 text-xs">{formatDateShort(new Date(w.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
