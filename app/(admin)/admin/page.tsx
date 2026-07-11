/**
 * app/(admin)/admin/page.tsx — Platform admin KPI dashboard
 *
 * Route:  /admin
 * Auth:   requireAdminAuth() — HMAC pleks_admin_token cookie
 * Data:   getAdminDashboardData() — parallel Supabase queries (page is dynamic via cookies()).
 *         MRRSnapshotCard and SentryErrorsCard fetch their own data independently.
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { getAdminDashboardData } from "@/lib/admin/dashboard-queries"
import { AttentionQueueCard }    from "@/components/admin/DashboardCards/AttentionQueueCard"
import { TierDistributionCard }  from "@/components/admin/DashboardCards/TierDistributionCard"
import { MRRSnapshotCard }       from "@/components/admin/DashboardCards/MRRSnapshotCard"
import { ConversionFunnelCard }  from "@/components/admin/DashboardCards/ConversionFunnelCard"
import { RecentSignupsCard }     from "@/components/admin/DashboardCards/RecentSignupsCard"
import { FailedCronsCard }       from "@/components/admin/DashboardCards/FailedCronsCard"
import { SentryErrorsCard }      from "@/components/admin/DashboardCards/SentryErrorsCard"
import { UptimeHeartbeatCard }   from "@/components/admin/DashboardCards/UptimeHeartbeatCard"
import { PrimeRateCard }         from "@/components/admin/DashboardCards/PrimeRateCard"
import { CostHealthCard }        from "@/components/admin/DashboardCards/CostHealthCard"
import { optionalEnv } from "@/lib/env"

// Page is dynamic via requireAdminAuth() → cookies(). No revalidate config —
// the ISR + cookies() combination is a hard error in Next.js 16.

function getGreeting(): string {
  const h = ((new Date().getUTCHours() + 2) % 24 + 24) % 24 // SAST
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function getSastTime(): string {
  return new Date().toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function buildSummaryLine(snap: Awaited<ReturnType<typeof getAdminDashboardData>>): string {
  const parts: string[] = []
  if (snap.attentionQueue.length > 0) parts.push(`${snap.attentionQueue.length} item${snap.attentionQueue.length === 1 ? "" : "s"} need attention`)
  if (snap.failedCrons.length > 0) parts.push(`${snap.failedCrons.length} cron${snap.failedCrons.length === 1 ? "" : "s"} failing`)
  if (snap.funnel.trialing > 0) parts.push(`${snap.funnel.trialing} trialing`)
  if (parts.length === 0) return "All systems nominal."
  return parts.join(". ") + "."
}

export default async function AdminOverviewPage() {
  await requireAdminAuth()
  const snap = await getAdminDashboardData()
  const adminName = (optionalEnv("ADMIN_NAME", "")).split(" ")[0] || "Admin"

  return (
    <div>
      {/* Page header — D-ADMIN-22 operator context bar */}
      <div style={{ marginBottom: 28 }}>
        {/* Context bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--positive)", display: "inline-block", flexShrink: 0 }} />
          <span>Operator</span>
          <span>·</span>
          <span>{getSastTime()} SAST</span>
        </div>

        <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>
          {getGreeting()}, {adminName}.
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--ink-mute)" }}>
          {buildSummaryLine(snap)}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>

        {/* Row 1 — 8 + 4 = 12 */}
        <AttentionQueueCard
          items={snap.attentionQueue}
          totalCount={snap.attentionQueue.length}
        />
        <TierDistributionCard tiers={snap.tierDistribution} />

        {/* Row 2 — 12 (full width MRR with trend chart) */}
        <MRRSnapshotCard />

        {/* Row 3 — 4 + 4 + 4 = 12 */}
        <ConversionFunnelCard funnel={snap.funnel} />
        <RecentSignupsCard signups={snap.recentSignups} />
        <FailedCronsCard failed={snap.failedCrons} />

        {/* Row 4 — 8 + 4 = 12 */}
        <SentryErrorsCard />
        <PrimeRateCard primeRate={snap.primeRate} />

        {/* Row 5 — 8 + 4 = 12 */}
        <UptimeHeartbeatCard />
        <CostHealthCard />

      </div>
    </div>
  )
}
