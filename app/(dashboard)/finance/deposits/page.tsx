import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatZAR } from "@/lib/constants"
import { BackLink } from "@/components/ui/BackLink"

export default async function DepositsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const monthStart = new Date()
  monthStart.setDate(1)

  const [activeLeasesRes, reconsRes, overdueTimersRes, completedReconsRes] = await Promise.all([
    supabase
      .from("leases")
      .select(`id, deposit_amount_cents, status, units(unit_number, properties(name)), tenant_view(first_name, last_name)`)
      .eq("org_id", orgId)
      .gt("deposit_amount_cents", 0)
      .in("status", ["active", "notice", "expired"])
      .order("created_at", { ascending: false }),
    supabase
      .from("deposit_reconciliations")
      .select(`id, lease_id, tenant_id, deposit_held_cents, interest_accrued_cents, total_available_cents, refund_to_tenant_cents, total_deductions_cents, status, leases(units(unit_number, properties(name)), tenant_view(first_name, last_name))`)
      .eq("org_id", orgId)
      .in("status", ["draft", "pending_review", "sent_to_tenant", "disputed", "overdue"])
      .order("created_at", { ascending: false }),
    supabase
      .from("deposit_timers")
      .select("lease_id, deadline")
      .eq("org_id", orgId)
      .eq("status", "running")
      .lt("deadline", new Date().toISOString().split("T")[0]),
    supabase
      .from("deposit_reconciliations")
      .select(`id, lease_id, refund_to_tenant_cents, total_deductions_cents, status, leases(units(unit_number, properties(name)), tenant_view(first_name, last_name))`)
      .eq("org_id", orgId)
      .eq("status", "refunded")
      .gte("tenant_refund_paid_at", monthStart.toISOString()),
  ])

  const activeLeases = activeLeasesRes.data
  const recons = reconsRes.data
  const overdueTimers = overdueTimersRes.data
  const completedRecons = completedReconsRes.data

  const totalDepositsHeld = (activeLeases ?? []).reduce(
    (s, l) => s + (l.deposit_amount_cents ?? 0), 0
  )

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    pending_review: "bg-yellow-100 text-yellow-700",
    sent_to_tenant: "bg-blue-100 text-blue-700",
    disputed: "bg-red-100 text-red-700",
    overdue: "bg-red-100 text-red-700",
    refunded: "bg-emerald-100 text-emerald-700",
  }

  return (
    <div className="space-y-6">
      <BackLink href="/finance" label="Finance" />
      <h1 className="font-heading text-3xl">Deposits</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total deposits held</p>
            <p className="font-heading text-xl">{formatZAR(totalDepositsHeld)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active leases</p>
            <p className="font-heading text-xl">{activeLeases?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pending reconciliation</p>
            <p className="font-heading text-xl">{recons?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="font-heading text-xl text-red-600">{overdueTimers?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending reconciliations */}
      {(recons ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending Reconciliation</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Tenant</th>
                  <th className="text-left py-2 pr-2">Unit</th>
                  <th className="text-right py-2 px-2">Deposit</th>
                  <th className="text-right py-2 px-2">Refund</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(recons ?? []).map((r) => {
                  const rLease = r.leases as unknown as { units: { unit_number: string; properties: { name: string } | null } | null; tenant_view: { first_name: string; last_name: string } | null } | null
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-2">{rLease?.tenant_view ? `${rLease.tenant_view.first_name} ${rLease.tenant_view.last_name}` : "—"}</td>
                      <td className="py-2 pr-2 text-xs">{rLease?.units?.unit_number}, {rLease?.units?.properties?.name}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.total_available_cents)}</td>
                      <td className="text-right py-2 px-2 text-emerald-600">{formatZAR(r.refund_to_tenant_cents)}</td>
                      <td className="py-2 px-2">
                        <Badge className={statusColors[r.status] ?? ""} variant="secondary">
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="text-right py-2">
                        <Button variant="ghost" size="sm" render={<Link href={`/leases/${r.lease_id}/deposit`} />}>
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Completed this month */}
      {(completedRecons ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completed This Month</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Tenant</th>
                  <th className="text-left py-2 pr-2">Unit</th>
                  <th className="text-right py-2 px-2">Refunded</th>
                  <th className="text-right py-2 px-2">Deductions</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(completedRecons ?? []).map((r) => {
                  const rLease = r.leases as unknown as { units: { unit_number: string; properties: { name: string } | null } | null; tenant_view: { first_name: string; last_name: string } | null } | null
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-2">{rLease?.tenant_view ? `${rLease.tenant_view.first_name} ${rLease.tenant_view.last_name}` : "—"}</td>
                      <td className="py-2 pr-2 text-xs">{rLease?.units?.unit_number}, {rLease?.units?.properties?.name}</td>
                      <td className="text-right py-2 px-2 text-emerald-600">{formatZAR(r.refund_to_tenant_cents)}</td>
                      <td className="text-right py-2 px-2">{formatZAR(r.total_deductions_cents)}</td>
                      <td className="py-2"><Badge className="bg-emerald-100 text-emerald-700" variant="secondary">Refunded</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Active deposits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Active Deposits ({activeLeases?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(activeLeases ?? []).length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Tenant</th>
                  <th className="text-left py-2 pr-2">Unit</th>
                  <th className="text-right py-2 px-2">Deposit</th>
                  <th className="text-left py-2">Lease status</th>
                </tr>
              </thead>
              <tbody>
                {(activeLeases ?? []).map((l) => {
                  const lUnit = l.units as unknown as { unit_number: string; properties: { name: string } | null } | null
                  const lTenant = l.tenant_view as unknown as { first_name: string; last_name: string } | null
                  return (
                    <tr key={l.id} className="border-b border-border/50">
                      <td className="py-2 pr-2">{lTenant ? `${lTenant.first_name} ${lTenant.last_name}` : "—"}</td>
                      <td className="py-2 pr-2 text-xs">{lUnit?.unit_number}, {lUnit?.properties?.name}</td>
                      <td className="text-right py-2 px-2">{formatZAR(l.deposit_amount_cents)}</td>
                      <td className="py-2 capitalize text-xs">{l.status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No active deposits.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
