/**
 * app/(admin)/admin/trust-health/page.tsx — Cross-agency trust account operational health
 *
 * Route:  /admin/trust-health
 * Auth:   requireAdminAuth — platform-admin HMAC token gate
 * Data:   trust_reconciliation_periods, organisations, bank_accounts (service-role, all orgs)
 * Notes:  Read-only operational view. Not a custodial view — shows adoption + anomalies only.
 *         Per D-TRUST-16: data read per-org independently; no cross-agency aggregation of balances.
 */

import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"

interface OrgRow {
  id: string
  name: string
  ppra_ffc_number: string | null
  ppra_ffc_expiry_date: string | null
}

interface PeriodRow {
  id: string
  org_id: string
  period_start: string
  period_end: string
  variance_cents: number
  variance_acknowledged: boolean
  signed_off_at: string | null
  status: string
}

function priorMonthRange(): { start: string; end: string; in90Days: string } {
  const now = new Date()
  const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
  const m = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const ms = String(m).padStart(2, "0")
  const future = new Date(now)
  future.setUTCDate(future.getUTCDate() + 90)
  return {
    start: `${y}-${ms}-01`,
    end: `${y}-${ms}-${String(lastDay).padStart(2, "0")}`,
    in90Days: future.toISOString().slice(0, 10),
  }
}

function daysOverdue(periodEnd: string): number {
  const end = new Date(periodEnd)
  const now = new Date()
  const msPerDay = 86_400_000
  return Math.max(0, Math.floor((now.getTime() - end.getTime()) / msPerDay))
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function fmtZAR(cents: number): string {
  return `R ${(Math.abs(cents) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function TrustHealthPage() {
  await requireAdminAuth()

  const db = await createServiceClient()
  const { start: priorStart, end: priorEnd, in90Days } = priorMonthRange()

  const [orgsResult, periodsResult, ffcResult] = await Promise.all([
    db.from("organisations").select("id, name, ppra_ffc_number, ppra_ffc_expiry_date").order("name"),
    db
      .from("trust_reconciliation_periods")
      .select("id, org_id, period_start, period_end, variance_cents, variance_acknowledged, signed_off_at, status")
      .gte("period_end", priorStart)
      .lte("period_end", priorEnd),
    db
      .from("organisations")
      .select("id, name, ppra_ffc_number, ppra_ffc_expiry_date")
      .not("ppra_ffc_expiry_date", "is", null)
      .lte("ppra_ffc_expiry_date", in90Days)
      .order("ppra_ffc_expiry_date"),
  ])

  if (orgsResult.error) console.error("[trust-health] orgs failed:", orgsResult.error.message)
  if (periodsResult.error) console.error("[trust-health] periods failed:", periodsResult.error.message)
  if (ffcResult.error) console.error("[trust-health] ffc failed:", ffcResult.error.message)

  const orgs = (orgsResult.data ?? []) as OrgRow[]
  const periods = (periodsResult.data ?? []) as PeriodRow[]
  const ffcExpiring = (ffcResult.data ?? []) as OrgRow[]

  const orgMap = new Map(orgs.map((o) => [o.id, o]))

  // Orgs with at least one prior-month period row (regardless of status)
  const orgsWithActivity = new Set(periods.map((p) => p.org_id))

  // Orgs that DO have a signed-off period for the prior month
  const orgsSignedOff = new Set(
    periods.filter((p) => p.status === "signed_off").map((p) => p.org_id)
  )

  // Overdue: has activity but not signed off
  const overdue = [...orgsWithActivity]
    .filter((id) => !orgsSignedOff.has(id))
    .map((id) => ({ org: orgMap.get(id), daysOver: daysOverdue(priorEnd) }))
    .filter((r): r is { org: OrgRow; daysOver: number } => r.org !== undefined)
    .sort((a, b) => b.daysOver - a.daysOver)

  // Variances in the prior month (signed-off with non-zero variance)
  const variances = periods
    .filter((p) => p.status === "signed_off" && p.variance_cents !== 0)
    .map((p) => ({ period: p, org: orgMap.get(p.org_id) }))
    .filter((r): r is { period: PeriodRow; org: OrgRow } => r.org !== undefined)
    .sort((a, b) => Math.abs(b.period.variance_cents) - Math.abs(a.period.variance_cents))

  const priorMonthLabel = new Date(priorStart).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Trust health</h1>
        <p className="text-sm text-muted-foreground">
          Cross-agency trust account adoption — {priorMonthLabel}. Read-only operational view.
        </p>
      </div>

      {/* Overdue closes */}
      <section>
        <h2 className="text-sm font-medium mb-2">
          Agencies past due on {priorMonthLabel} close ({overdue.length})
        </h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted-foreground">All active agencies have closed {priorMonthLabel}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Agency</th>
                  <th className="text-right py-1 pr-4">Days overdue</th>
                  <th className="text-left py-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map(({ org, daysOver }) => (
                  <tr key={org.id} className="border-b border-muted hover:bg-muted/30">
                    <td className="py-1.5 pr-4 font-medium">{org.name}</td>
                    <td className="py-1.5 pr-4 text-right text-warning font-medium">{daysOver}</td>
                    <td className="py-1.5">
                      <a href={`/admin/orgs/${org.id}`} className="text-brand hover:underline">
                        View org
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Variances */}
      <section>
        <h2 className="text-sm font-medium mb-2">
          Acknowledged variances — {priorMonthLabel} ({variances.length})
        </h2>
        {variances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No variances recorded for {priorMonthLabel}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Agency</th>
                  <th className="text-right py-1 pr-4">Variance</th>
                  <th className="text-left py-1 pr-4">Signed off</th>
                  <th className="text-left py-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {variances.map(({ period, org }) => (
                  <tr key={period.id} className="border-b border-muted hover:bg-muted/30">
                    <td className="py-1.5 pr-4 font-medium">{org.name}</td>
                    <td className="py-1.5 pr-4 text-right text-warning">{fmtZAR(period.variance_cents)}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {period.signed_off_at ? fmtDate(period.signed_off_at) : "—"}
                    </td>
                    <td className="py-1.5">
                      <a href={`/admin/orgs/${org.id}`} className="text-brand hover:underline">
                        View org
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* FFC expiry */}
      <section>
        <h2 className="text-sm font-medium mb-2">
          FFC expiring within 90 days ({ffcExpiring.length})
        </h2>
        {ffcExpiring.length === 0 ? (
          <p className="text-sm text-muted-foreground">No FFCs expiring in the next 90 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Agency</th>
                  <th className="text-left py-1 pr-4">FFC number</th>
                  <th className="text-left py-1 pr-4">Expires</th>
                  <th className="text-left py-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {ffcExpiring.map((org) => (
                  <tr key={org.id} className="border-b border-muted hover:bg-muted/30">
                    <td className="py-1.5 pr-4 font-medium">{org.name}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{org.ppra_ffc_number ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-warning font-medium">
                      {org.ppra_ffc_expiry_date ? fmtDate(org.ppra_ffc_expiry_date) : "—"}
                    </td>
                    <td className="py-1.5">
                      <a href={`/admin/orgs/${org.id}`} className="text-brand hover:underline">
                        Reach out
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
