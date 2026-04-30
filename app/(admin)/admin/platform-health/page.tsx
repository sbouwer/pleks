/**
 * app/(admin)/admin/platform-health/page.tsx — Platform cost & usage dashboard
 *
 * Route:  /admin/platform-health
 * Auth:   pleks_admin_token cookie (requireAdminAuth)
 * Data:   platform_cost_snapshots (last 12 months, all orgs), organisations
 * Notes:  Shows aggregate revenue vs cost trend, top-10 cost outliers, and MoM deltas.
 *         Data is built nightly by /api/cron/cost-snapshots at 06:30 UTC.
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import Link from "next/link"

interface SnapshotRow {
  id: string
  org_id: string
  period: string
  email_count: number
  wa_count: number
  sms_count: number
  ai_call_count: number
  email_cost_cents: number
  wa_cost_cents: number
  sms_cost_cents: number
  ai_cost_cents: number
  allocated_vercel_cents: number
  allocated_supabase_cents: number
  allocated_fixed_overhead_cents: number
  total_cost_cents: number
  revenue_cents: number
  gross_margin_cents: number
  active_leases: number
  last_user_login_at: string | null
  updated_at: string
}

interface OrgRow {
  id: string
  name: string
}

function formatZAR(cents: number) {
  const rands = cents / 100
  return `R ${rands.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function marginPct(revenue: number, cost: number): string {
  if (revenue === 0) {
    if (cost === 0) return "—"
    return "-∞"
  }
  return `${((revenue - cost) / revenue * 100).toFixed(1)}%`
}

function momDelta(current: number, prev: number): { label: string; color: string } {
  if (prev === 0) return { label: "—", color: "text-muted-foreground" }
  const pct = ((current - prev) / prev) * 100
  const label = `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`
  let color = "text-muted-foreground"
  if (pct > 20)  color = "text-red-600"
  if (pct < 0)   color = "text-green-600"
  return { label, color }
}

function currentMonthPeriod(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

function prevMonthPeriod(): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

export default async function PlatformHealthPage() {
  await requireAdminAuth()

  const db = await createServiceClient()

  // Fetch last 12 months of snapshots (all orgs)
  const twelveMthsAgo = new Date()
  twelveMthsAgo.setUTCMonth(twelveMthsAgo.getUTCMonth() - 11)
  twelveMthsAgo.setUTCDate(1)
  const sinceStr = twelveMthsAgo.toISOString().slice(0, 10)

  const { data: snapshots, error: snapErr } = await db
    .from("platform_cost_snapshots")
    .select("*")
    .gte("period", sinceStr)
    .order("period", { ascending: false })
  if (snapErr) console.error("[platform-health] snapshots query failed:", snapErr.message)

  const { data: orgs, error: orgErr } = await db
    .from("organisations")
    .select("id, name")
  if (orgErr) console.error("[platform-health] orgs query failed:", orgErr.message)

  const orgMap = new Map<string, string>((orgs ?? []).map((o: OrgRow) => [o.id, o.name]))
  const rows = (snapshots ?? []) as SnapshotRow[]

  const currentPeriod = currentMonthPeriod()
  const prevPeriod    = prevMonthPeriod()

  // Aggregate by period for trend chart
  const byPeriod = new Map<string, { revenue: number; cost: number }>()
  for (const r of rows) {
    const existing = byPeriod.get(r.period) ?? { revenue: 0, cost: 0 }
    byPeriod.set(r.period, {
      revenue: existing.revenue + r.revenue_cents,
      cost:    existing.cost    + r.total_cost_cents,
    })
  }
  const periods = [...byPeriod.keys()].sort((a, b) => a.localeCompare(b))

  // Current-month top-10 by cost
  const currentRows = rows
    .filter(r => r.period === currentPeriod)
    .sort((a, b) => b.total_cost_cents - a.total_cost_cents)
    .slice(0, 10)

  // Previous-month costs by org for MoM delta
  const prevCostByOrg = new Map<string, number>()
  for (const r of rows.filter(r => r.period === prevPeriod)) {
    prevCostByOrg.set(r.org_id, r.total_cost_cents)
  }

  const thisPeriodAgg = byPeriod.get(currentPeriod) ?? { revenue: 0, cost: 0 }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Platform health</h1>
        <p className="text-sm text-muted-foreground">
          Cost &amp; usage across all orgs. Updated nightly at 08:30 SAST.
        </p>
      </div>

      {/* ── This month summary ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue (this month)</p>
          <p className="text-2xl font-semibold mt-1">{formatZAR(thisPeriodAgg.revenue)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Cost (this month)</p>
          <p className="text-2xl font-semibold mt-1">{formatZAR(thisPeriodAgg.cost)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Gross margin</p>
          <p className="text-2xl font-semibold mt-1">
            {marginPct(thisPeriodAgg.revenue, thisPeriodAgg.cost)}
          </p>
        </div>
      </div>

      {/* ── Monthly trend (text table — no chart library needed) ── */}
      {periods.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">12-month trend</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Period</th>
                  <th className="text-right py-1 pr-4">Revenue</th>
                  <th className="text-right py-1 pr-4">Cost</th>
                  <th className="text-right py-1">Margin</th>
                </tr>
              </thead>
              <tbody>
                {[...periods].reverse().map(p => {
                  const agg = byPeriod.get(p) ?? { revenue: 0, cost: 0 }
                  return (
                    <tr key={p} className="border-b border-muted">
                      <td className="py-1 pr-4 text-muted-foreground">{p.slice(0, 7)}</td>
                      <td className="py-1 pr-4 text-right">{formatZAR(agg.revenue)}</td>
                      <td className="py-1 pr-4 text-right">{formatZAR(agg.cost)}</td>
                      <td className="py-1 text-right">{marginPct(agg.revenue, agg.cost)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Top-10 cost outliers ── */}
      <div>
        <h2 className="text-sm font-medium mb-2">
          Top cost orgs — {currentPeriod.slice(0, 7)}
        </h2>
        {currentRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No snapshot data yet for this month. The cost-snapshots cron runs at 08:30 SAST.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-3">#</th>
                  <th className="text-left py-1 pr-3">Org</th>
                  <th className="text-right py-1 pr-3">Cost</th>
                  <th className="text-right py-1 pr-3">Revenue</th>
                  <th className="text-right py-1 pr-3">Margin</th>
                  <th className="text-right py-1 pr-3">vs last mo</th>
                  <th className="text-left py-1">Leases</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((r, i) => {
                  const orgName = orgMap.get(r.org_id) ?? r.org_id.slice(0, 8)
                  const prev    = prevCostByOrg.get(r.org_id) ?? 0
                  const delta   = momDelta(r.total_cost_cents, prev)
                  const isLoss  = r.gross_margin_cents < 0 && r.revenue_cents > 0
                  return (
                    <tr key={r.id} className="border-b border-muted hover:bg-muted/30">
                      <td className="py-1 pr-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-1 pr-3">
                        <Link href={`/admin/platform-health/${r.org_id}`} className="hover:underline">
                          {orgName}
                        </Link>
                        {isLoss && <span className="ml-1 text-red-600">🚩</span>}
                      </td>
                      <td className="py-1 pr-3 text-right">{formatZAR(r.total_cost_cents)}</td>
                      <td className="py-1 pr-3 text-right">{formatZAR(r.revenue_cents)}</td>
                      <td className="py-1 pr-3 text-right">{marginPct(r.revenue_cents, r.total_cost_cents)}</td>
                      <td className={`py-1 pr-3 text-right ${delta.color}`}>{delta.label}</td>
                      <td className="py-1">{r.active_leases}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
