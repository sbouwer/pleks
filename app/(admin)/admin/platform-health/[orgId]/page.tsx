/**
 * app/(admin)/admin/platform-health/[orgId]/page.tsx — Per-org cost drill-down
 *
 * Route:  /admin/platform-health/[orgId]
 * Auth:   pleks_admin_token cookie (requireAdminAuth)
 * Data:   platform_cost_snapshots (12 months, this org), ai_usage (by purpose, this org)
 * Notes:  Shows per-channel spend trend and AI usage breakdown by purpose.
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import Link from "next/link"

interface SnapshotRow {
  period: string
  email_count: number
  email_cost_cents: number
  wa_count: number
  wa_cost_cents: number
  sms_count: number
  sms_cost_cents: number
  ai_call_count: number
  ai_cost_cents: number
  allocated_vercel_cents: number
  allocated_supabase_cents: number
  allocated_fixed_overhead_cents: number
  total_cost_cents: number
  revenue_cents: number
  gross_margin_cents: number
  active_leases: number
}

function formatZAR(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function OrgCostDrillDownPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  await requireAdminAuth()

  const { orgId } = await params
  const db = await createServiceClient()

  const twelveMthsAgo = new Date()
  twelveMthsAgo.setUTCMonth(twelveMthsAgo.getUTCMonth() - 11)
  twelveMthsAgo.setUTCDate(1)

  const [{ data: snapshots, error: snapErr }, { data: org, error: orgErr }, { data: aiByPurpose, error: aiErr }] =
    await Promise.all([
      db.from("platform_cost_snapshots")
        .select("*")
        .eq("org_id", orgId)
        .gte("period", twelveMthsAgo.toISOString().slice(0, 10))
        .order("period", { ascending: false }),
      db.from("organisations").select("id, name").eq("id", orgId).single(),
      db.from("ai_usage")
        .select("purpose, cost_cents")
        .eq("org_id", orgId)
        .gte("created_at", twelveMthsAgo.toISOString())
        .eq("success", true),
    ])

  if (snapErr) console.error("[platform-health/org] snapshots failed:", snapErr.message)
  if (orgErr)  console.error("[platform-health/org] org query failed:", orgErr.message)
  if (aiErr)   console.error("[platform-health/org] ai_usage failed:", aiErr.message)

  const rows = (snapshots ?? []) as SnapshotRow[]
  const orgName = (org as { name: string } | null)?.name ?? orgId

  // AI spend by purpose
  const purposeTotals = new Map<string, number>()
  for (const r of aiByPurpose ?? []) {
    const p = r.purpose as string
    purposeTotals.set(p, (purposeTotals.get(p) ?? 0) + ((r.cost_cents as number) ?? 0))
  }
  const purposeEntries = [...purposeTotals.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Link href="/admin/platform-health" className="text-sm text-muted-foreground hover:underline">
          ← Platform health
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{orgName}</h1>
        <p className="text-xs text-muted-foreground font-mono">{orgId}</p>
      </div>

      {/* ── Per-month breakdown ── */}
      <div>
        <h2 className="text-sm font-medium mb-2">12-month cost breakdown</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No snapshot data yet for this org.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-3">Period</th>
                  <th className="text-right py-1 pr-3">Email</th>
                  <th className="text-right py-1 pr-3">WhatsApp</th>
                  <th className="text-right py-1 pr-3">AI</th>
                  <th className="text-right py-1 pr-3">Infra</th>
                  <th className="text-right py-1 pr-3">Total cost</th>
                  <th className="text-right py-1 pr-3">Revenue</th>
                  <th className="text-right py-1">Leases</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const infra = r.allocated_vercel_cents + r.allocated_supabase_cents + r.allocated_fixed_overhead_cents
                  return (
                    <tr key={r.period} className="border-b border-muted">
                      <td className="py-1 pr-3 text-muted-foreground">{r.period.slice(0, 7)}</td>
                      <td className="py-1 pr-3 text-right">
                        {formatZAR(r.email_cost_cents)}
                        <span className="text-muted-foreground ml-1">({r.email_count})</span>
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {formatZAR(r.wa_cost_cents)}
                        <span className="text-muted-foreground ml-1">({r.wa_count})</span>
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {formatZAR(r.ai_cost_cents)}
                        <span className="text-muted-foreground ml-1">({r.ai_call_count})</span>
                      </td>
                      <td className="py-1 pr-3 text-right">{formatZAR(infra)}</td>
                      <td className="py-1 pr-3 text-right font-medium">{formatZAR(r.total_cost_cents)}</td>
                      <td className="py-1 pr-3 text-right">{formatZAR(r.revenue_cents)}</td>
                      <td className="py-1 text-right">{r.active_leases}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AI spend by purpose ── */}
      {purposeEntries.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">AI spend by purpose (last 12 months)</h2>
          <div className="space-y-1">
            {purposeEntries.map(([purpose, cents]) => (
              <div key={purpose} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{purpose.replaceAll("_", " ")}</span>
                <span>{formatZAR(cents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
