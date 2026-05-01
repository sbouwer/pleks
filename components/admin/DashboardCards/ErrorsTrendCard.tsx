/**
 * components/admin/DashboardCards/ErrorsTrendCard.tsx — Sentry deeplink card
 *
 * Notes:  No Sentry API integration yet — renders a direct Sentry deeplink.
 *         If platform_cost_snapshots is available (ADDENDUM_00H shipped), shows
 *         a "Top cost outlier" note. Otherwise renders a clean placeholder.
 */
import Link from "next/link"
import { createServiceClient } from "@/lib/supabase/server"

async function getTopCostOrg(): Promise<{ name: string; ai_cost_cents: number } | null> {
  try {
    const db = await createServiceClient()
    const now = new Date()
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
    const { data } = await db
      .from("platform_cost_snapshots")
      .select("org_id, ai_cost_cents, organisations(name)")
      .eq("period", period)
      .order("ai_cost_cents", { ascending: false })
      .limit(1)
      .single()
    if (!data) return null
    const org = (data.organisations as unknown as { name: string } | null)
    return { name: org?.name ?? data.org_id, ai_cost_cents: (data.ai_cost_cents as number) ?? 0 }
  } catch {
    return null
  }
}

export async function ErrorsTrendCard() {
  const topCost = await getTopCostOrg()

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 4",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Errors
        </span>
      </div>
      <div style={{ padding: "16px 18px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <a
          href="https://sentry.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--rule-strong)",
            color: "var(--ink)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          <span>Open Sentry ↗</span>
        </a>

        {topCost && topCost.ai_cost_cents > 0 && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            <p style={{ margin: "0 0 4px", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
              Top AI cost this month
            </p>
            <Link href="/admin/platform-health" style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }}>
              {topCost.name}
            </Link>
            <span style={{ color: "var(--ink-mute)", marginLeft: 6 }}>
              R{(topCost.ai_cost_cents / 100).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
