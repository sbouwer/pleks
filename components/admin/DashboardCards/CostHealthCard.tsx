/**
 * components/admin/DashboardCards/CostHealthCard.tsx — Top-5 cost outliers from cost snapshots
 *
 * Auth:   Server component — rendered inside admin dashboard (behind requireAdminAuth)
 * Data:   platform_cost_snapshots — most recent period, top-5 orgs by total_cost_cents
 * Notes:  Flags negative-margin orgs (cost > revenue) in red. Requires ADDENDUM_00H data.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface CostRow {
  org_id: string
  org_name: string
  total_cost_cents: number
  revenue_cents: number
  gross_margin_cents: number
}

async function fetchCostOutliers(): Promise<{ rows: CostRow[]; period: string | null }> {
  const db = await createServiceClient()

  // Find the most recent snapshot period
  const { data: latest, error: latestError } = await db
    .from("platform_cost_snapshots")
    .select("period")
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle()
    logQueryError("fetchCostOutliers platform_cost_snapshots", latestError)

  if (!latest?.period) return { rows: [], period: null }

  const { data, error } = await db
    .from("platform_cost_snapshots")
    .select("org_id, total_cost_cents, revenue_cents, gross_margin_cents")
    .eq("period", latest.period)
    .order("total_cost_cents", { ascending: false })
    .limit(5)

  if (error) {
    console.error("[CostHealthCard] query failed:", error.message)
    return { rows: [], period: latest.period as string }
  }

  const orgIds = (data ?? []).map((r) => r.org_id as string).filter(Boolean)
  const { data: orgs } = orgIds.length > 0
    ? await db.from("organisations").select("id, name").in("id", orgIds)
    : { data: [] }
  const orgMap = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]))

  const rows: CostRow[] = (data ?? []).map((r) => ({
    org_id:             r.org_id as string,
    org_name:           orgMap.get(r.org_id as string) ?? (r.org_id as string).slice(0, 8),
    total_cost_cents:   (r.total_cost_cents as number) ?? 0,
    revenue_cents:      (r.revenue_cents as number) ?? 0,
    gross_margin_cents: (r.gross_margin_cents as number) ?? 0,
  }))

  return { rows, period: latest.period as string }
}

function fmtRands(cents: number): string {
  const r = cents / 100
  return `R ${r.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export async function CostHealthCard() {
  const { rows, period } = await fetchCostOutliers()

  const hasNegative = rows.some((r) => r.gross_margin_cents < 0)

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: hasNegative ? "1px solid oklch(0.55 0.18 25 / 0.4)" : "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 4",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px 12px",
        borderBottom: "1px solid var(--rule)",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Cost outliers
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.04em" }}>
          {period ?? "—"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12.5, color: "var(--ink-mute)" }}>
          No cost snapshot data yet. Deploy ADDENDUM_00H to populate.
        </div>
      ) : (
        <div>
          {rows.map((row) => {
            const isNeg = row.gross_margin_cents < 0
            const marginColor = isNeg ? "var(--critical)" : "var(--positive)"
            return (
              <div key={row.org_id} style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "9px 18px",
                borderBottom: "1px solid var(--rule)",
                borderLeft: isNeg ? "3px solid var(--critical)" : "3px solid transparent",
              }}>
                <span style={{
                  fontSize: 12.5,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {row.org_name}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)", whiteSpace: "nowrap" }}>
                  {fmtRands(row.total_cost_cents)}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: marginColor, whiteSpace: "nowrap", minWidth: 54, textAlign: "right" }}>
                  {isNeg ? "−" : "+"}{fmtRands(Math.abs(row.gross_margin_cents))}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
