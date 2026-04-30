/**
 * app/(admin)/admin/page.tsx — Platform admin KPI dashboard
 *
 * Route:  /admin
 * Auth:   requireAdminAuth() — HMAC pleks_admin_token cookie
 * Data:   getAdminDashboardData() — ~15 parallel Supabase queries, cached 60s
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { getAdminDashboardData } from "@/lib/admin/dashboard-queries"
import { AttentionQueueCard }    from "@/components/admin/DashboardCards/AttentionQueueCard"
import { TierDistributionCard }  from "@/components/admin/DashboardCards/TierDistributionCard"
import { MRRSnapshotCard }       from "@/components/admin/DashboardCards/MRRSnapshotCard"
import { ConversionFunnelCard }  from "@/components/admin/DashboardCards/ConversionFunnelCard"
import { RecentSignupsCard }     from "@/components/admin/DashboardCards/RecentSignupsCard"
import { FailedCronsCard }       from "@/components/admin/DashboardCards/FailedCronsCard"
import { ErrorsTrendCard }       from "@/components/admin/DashboardCards/ErrorsTrendCard"
import { PrimeRateCard }         from "@/components/admin/DashboardCards/PrimeRateCard"

export const revalidate = 60

function getGreeting(): string {
  const utcHour = new Date().getUTCHours()
  const h = (utcHour + 2) % 24 // SAST = UTC+2
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export default async function AdminOverviewPage() {
  await requireAdminAuth()
  const snap = await getAdminDashboardData()

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{
          margin: "0 0 10px",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
        }}>
          {getGreeting()}
        </p>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { label: "Total orgs",   value: snap.totalOrgs },
            { label: "Active (paid)", value: snap.activeOrgs },
            { label: "Trialing",     value: snap.funnel.trialing },
            { label: "Waitlist",     value: snap.funnel.waitlist },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{
                margin: "0 0 2px",
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
              }}>
                {label}
              </p>
              <p style={{
                margin: 0,
                fontFamily: "var(--mono)",
                fontSize: 24,
                fontWeight: 600,
                color: "var(--ink)",
                fontFeatureSettings: '"tnum"',
                lineHeight: 1,
              }}>
                {value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 12-col KPI grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: 16,
      }}>
        {/* Row 1 — 8 + 4 = 12 */}
        <AttentionQueueCard
          items={snap.attentionQueue}
          totalCount={snap.attentionQueue.length}
        />
        <TierDistributionCard tiers={snap.tierDistribution} />

        {/* Row 2 — 6 + 6 = 12 */}
        <MRRSnapshotCard mrr={snap.mrr} />
        <ConversionFunnelCard funnel={snap.funnel} />

        {/* Row 3 — 6 + 6 = 12 */}
        <RecentSignupsCard signups={snap.recentSignups} />
        <FailedCronsCard failed={snap.failedCrons} />

        {/* Row 4 — 4 + 4 + 4 = 12 */}
        <ErrorsTrendCard />
        <PrimeRateCard primeRate={snap.primeRate} />
      </div>
    </div>
  )
}
