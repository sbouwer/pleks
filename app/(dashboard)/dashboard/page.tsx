/**
 * app/(dashboard)/dashboard/page.tsx — Main dashboard: greeting, KPI strip, onboarding checklist, heavy data sections
 *
 * Route:  /dashboard
 * Auth:   gatewaySSR() (agent session + org membership); redirects to /login if missing
 * Data:   gatewaySSR db (organisations, user_profiles, subscriptions, properties, units, tenants, leases, inspections — all org-scoped) + getCachedServiceClient reads + Suspense-streamed heavy sections
 * Notes:  Light queries render immediately; heavy sections stream in behind DashboardSectionsSkeleton
 */
import { Suspense } from "react"
import { MobileHomeScreen } from "@/components/mobile/MobileHomeScreen"
import { getCachedServiceClient } from "@/lib/supabase/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { DashboardBanners } from "./DashboardBanners"
import { MetricCard } from "@/components/ui/metric-card"
import { AttentionQueue } from "./AttentionQueue"
import { PortfolioHealthPanel } from "./PortfolioHealthPanel"
import { LeaseExpiryTimeline } from "./LeaseExpiryTimeline"
import { ActivityFeed } from "./ActivityFeed"
import { PropertySetupCards } from "./PropertySetupCards"
import { GettingStarted, type GettingStartedProgress } from "./GettingStarted"
import { WorkspaceSetup } from "./WorkspaceSetup"
import { QuickAddMenu } from "./QuickAddMenu"
import { DashboardGreeting } from "./DashboardGreeting"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import type { Tier } from "@/lib/constants"
import { type SurrenderedCommRow } from "./SurrenderedCommsWidget"
import { DashboardAlertsBell } from "./DashboardAlertsBell"
import { getEmailVerificationState } from "@/lib/actions/emailVerification"
import { formatZARAbbrev } from "@/lib/constants"
import { getFeesDue } from "@/lib/dashboard/feesDue"
import { getTrustBalance } from "@/lib/dashboard/trustBalance"
import { getCollectionRate, type CollectionRateData } from "@/lib/dashboard/collectionRate"
import { getPortfolioHealth } from "@/lib/dashboard/portfolioHealth"
import { getAttentionItems } from "@/lib/dashboard/attentionItems"
import { getActivityFeed } from "@/lib/dashboard/activityFeed"
import { getExpiringLeases } from "@/lib/dashboard/leaseExpiry"
import { computeTrialDaysLeft } from "@/lib/trial/utils"
import { SA_TIMEZONE } from "@/lib/dates"

type SubRow = { tier: string; status: string; trial_tier: string | null; trial_ends_at: string | null; trial_converted: boolean | null } | null

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function deriveTier(sub: SubRow): string {
  if (sub?.status === "trialing" && !sub.trial_converted && sub.trial_tier) return sub.trial_tier
  return sub?.tier ?? "owner"
}

function deriveTrialInfo(sub: SubRow) {
  const isTrialing = sub?.status === "trialing" && !sub?.trial_converted
  return { isTrialing, trialEndsAt: isTrialing ? sub?.trial_ends_at : null }
}

// ── Heavy sections — streams in behind a Suspense boundary ───────────────────

async function DashboardHeavySections({
  orgId,
  collectionRate,
  isOwner,
}: Readonly<{
  orgId: string
  collectionRate: CollectionRateData
  /** owner tier (single property, no trust/agency) — skip the agency Financials panel */
  isOwner: boolean
}>) {
  const [trustBalance, attentionItems, activityItems, expiringLeases, portfolioHealth] =
    await Promise.all([
      getTrustBalance(orgId),
      getAttentionItems(orgId),
      getActivityFeed(orgId),
      getExpiringLeases(orgId),
      getPortfolioHealth(orgId),
    ])

  // Owner tier: a single property with no trust account or other owners — the agency Financials
  // panel (trust balance, owners-unpaid, management fees) doesn't apply, so lead with what's
  // actionable for them: what needs attention + their lease expiry, then recent activity.
  if (isOwner) {
    return (
      <>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AttentionQueue items={attentionItems} />
          <LeaseExpiryTimeline leases={expiringLeases} />
        </div>
        <ActivityFeed items={activityItems} />
      </>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttentionQueue items={attentionItems} />
        <PortfolioHealthPanel collection={collectionRate} trustBalance={trustBalance} health={portfolioHealth} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LeaseExpiryTimeline leases={expiringLeases} />
        <ActivityFeed items={activityItems} />
      </div>
    </>
  )
}

function SkeletonLine({ w = "w-1/2", h = "h-3.5" }: { w?: string; h?: string }) {
  return <div className={`${h} ${w} rounded bg-muted animate-pulse`} />
}

function DashboardSectionsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Row 1: Needs attention + Financials */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Needs attention */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <SkeletonLine w="w-28" />
            <div className="h-4 w-5 rounded-full bg-muted animate-pulse" />
          </div>
          <ul className="divide-y">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-6 w-6 shrink-0 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonLine w="w-3/4" />
                  <SkeletonLine w="w-1/2" h="h-3" />
                </div>
                <div className="h-5 w-14 shrink-0 rounded-full bg-muted animate-pulse" />
              </li>
            ))}
          </ul>
        </div>

        {/* Financials */}
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <SkeletonLine w="w-20" />
          </div>
          <div className="grid grid-cols-2 divide-x divide-y">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 px-4 py-4">
                <SkeletonLine w="w-24" h="h-3" />
                <SkeletonLine w="w-20" h="h-6" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Lease expiry + Recent activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Lease expiry */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <SkeletonLine w="w-28" />
            <div className="h-4 w-5 rounded-full bg-muted animate-pulse" />
          </div>
          <ul className="divide-y">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-6 w-6 shrink-0 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonLine w="w-3/4" />
                  <SkeletonLine w="w-1/2" h="h-3" />
                </div>
                <div className="h-5 w-14 shrink-0 rounded-full bg-muted animate-pulse" />
              </li>
            ))}
          </ul>
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <SkeletonLine w="w-20" />
          </div>
          <div className="grid grid-cols-2 divide-x divide-y">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 px-4 py-4">
                <SkeletonLine w="w-24" h="h-3" />
                <SkeletonLine w="w-20" h="h-6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page — light queries render immediately ──────────────────────────────

export default async function DashboardPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { db, userId, orgId } = gw

  // Light wave — all independent, renders greeting + metrics immediately
  const [orgRes, profileRes, subRes, propCountRes, unitRes, collectionRate, feesDue, tenantsCountRes, leasesCountRes, inspectionsCountRes, landlordsCountRes, contractorsCountRes, surrenderedCommsRes] = await Promise.all([
    db
      .from("organisations")
      .select("has_trust_account, has_deposit_account, management_scope, founding_agent, founding_agent_price_cents, onboarding_dismissed_at")
      .eq("id", orgId)
      .single(),
    db
      .from("user_profiles")
      .select("full_name")
      .eq("id", userId)
      .single(),
    db
      .from("subscriptions")
      .select("tier, status, trial_tier, trial_ends_at, trial_converted")
      .eq("org_id", orgId)
      .in("status", ["active", "trialing"])
      .single(),
    db
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("deleted_at", null),
    db
      .from("units")
      .select("status")
      .eq("org_id", orgId)
      .is("deleted_at", null),
    getCollectionRate(orgId),
    getFeesDue(orgId),
    db.from("tenants").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    db.from("leases").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    db.from("inspections").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    getCachedServiceClient().then((c) => c.from("landlord_view").select("id", { count: "exact", head: true }).eq("org_id", orgId)),
    getCachedServiceClient().then((c) => c.from("contractors").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null)),
    // Surrendered mandatory comms requiring manual dispatch (BUILD_63 Phase 8)
    getCachedServiceClient().then((c) =>
      c.from("mandatory_comm_retries")
        .select("id, template_key, surrender_reason, surrendered_at, attempt_count, recipient_snapshot, communication_log(lease_id, entity_type, entity_id)")
        .eq("org_id", orgId)
        .not("surrendered_at", "is", null)
        .limit(20)
    ),
  ])

  // F-4: overdue deposit-return timers — a count roll-up for the alerts-bell Operations section
  // (the per-item view is the attention queue; this is the "N awaiting action" summary).
  const overdueTimersRes = await getCachedServiceClient().then((c) =>
    c.from("deposit_timers").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("status", "running").lt("deadline", new Date().toISOString()))
  const overdueDepositTimers = overdueTimersRes.count ?? 0

  const org = orgRes.data as unknown as Record<string, unknown> | null
  const firstName = profileRes.data?.full_name?.split(" ")[0] ?? "there"
  const sub = subRes.data as SubRow
  const totalProperties = propCountRes.count ?? 0
  const activeUnits = unitRes.data ?? []
  const totalUnits = activeUnits.length
  const occupiedUnits = activeUnits.filter((u) => u.status === "occupied").length
  const vacantUnits = activeUnits.filter((u) => u.status === "vacant").length
  const occupancyPercent = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
  // The guided setup dashboard shows until the org has its first property (an all-zeros populated
  // dashboard is never useful) — UNLESS someone explicitly skipped setup ("not my job — an admin will
  // do it"), which stamps onboarding_dismissed_at and reveals the populated view. "I'll finish later"
  // is a session-only defer (client-side) and deliberately does NOT set the flag, so setup returns.
  const onboardingDismissedAt = (org?.onboarding_dismissed_at as string | null) ?? null
  const showOnboarding = totalProperties === 0 && onboardingDismissedAt === null

  const onboardingProgress: GettingStartedProgress = {
    landlord:   (landlordsCountRes.count ?? 0) > 0,
    property:   totalProperties > 0,
    tenant:     (tenantsCountRes.count ?? 0) > 0,
    lease:      (leasesCountRes.count ?? 0) > 0,
    inspection: (inspectionsCountRes.count ?? 0) > 0,
    supplier:   (contractorsCountRes.count ?? 0) > 0,
  }

  const greeting = getGreeting()
  const dateStr = new Date().toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const tier = deriveTier(sub)
  const { isTrialing, trialEndsAt } = deriveTrialInfo(sub)
  const trialDaysLeft = computeTrialDaysLeft(trialEndsAt ?? null)
  const showTrustBanner = tier !== "owner" && org?.has_trust_account !== true

  type RetryRow = { id: string; template_key: string; surrender_reason: string | null; surrendered_at: string; attempt_count: number; recipient_snapshot: { email?: string; phone?: string } | null; communication_log: { lease_id: string | null; entity_type: string | null; entity_id: string | null } | null }
  const surrenderedCommItems: SurrenderedCommRow[] = ((surrenderedCommsRes.data ?? []) as unknown as RetryRow[]).map((r) => {
    const cl = r.communication_log
    // lease_id is the dedicated FK; fall back to the polymorphic entity ref when it's a lease.
    const leaseId = cl?.lease_id ?? (cl?.entity_type === "lease" ? cl.entity_id : null)
    return {
      id:               r.id,
      template_key:     r.template_key,
      surrender_reason: r.surrender_reason,
      surrendered_at:   r.surrendered_at,
      attempt_count:    r.attempt_count,
      recipient_email:  r.recipient_snapshot?.email ?? null,
      recipient_name:   null,
      lease_id:         leaseId,
    }
  })

  const emailVerify = await getEmailVerificationState()

  return (
    <>
    <div className="lg:hidden">
      <MobileHomeScreen />
    </div>
    <div className="hidden lg:block">
    <div className="space-y-5">
      {/* Page header — same rhythm as every other page (eyebrow · date / greeting / sub / Quick add) */}
      <ResourcePageHeader
        eyebrow={`Overview · ${dateStr}`}
        title={<DashboardGreeting firstName={firstName} fallback={`${greeting}, ${firstName}.`} />}
        headline="Your workspace"
        sub={showOnboarding ? "Ready when you are — let's bring your portfolio to life." : "Here's your portfolio at a glance."}
        action={
          <div className="flex items-center gap-2">
            <DashboardAlertsBell
              surrendered={surrenderedCommItems}
              showDepositSetup={showTrustBanner}
              tier={tier as Tier}
              leaseCount={leasesCountRes.count ?? 0}
              emailVerify={emailVerify}
              overdueDepositTimers={overdueDepositTimers}
            />
            <QuickAddMenu />
          </div>
        }
      />

      {/* Banners */}
      <DashboardBanners
        isTrialing={isTrialing}
        trialDaysLeft={trialDaysLeft}
        trialTier={sub?.trial_tier}
        isFoundingAgent={!!org?.founding_agent}
        foundingPriceCents={org?.founding_agent_price_cents as number | null}
      />

      {showOnboarding ? (
        /* ── New-user empty state — get-started steps + workspace setup ──────── */
        <>
          <GettingStarted progress={onboardingProgress} />
          <WorkspaceSetup isOwner={tier === "owner"} />
        </>
      ) : (
        /* ── Populated dashboard ────────────────────────────────────────────── */
        <>
      {/* BUILD_60 property setup cards — check imports */}
      <PropertySetupCards
        orgId={orgId}
        totalProperties={totalProperties}
        isAdmin={gw.role === "owner"}
      />

      {/* KPI strip — connected panel */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card md:grid-cols-4">
        <MetricCard
          label="Properties"
          value={String(totalProperties)}
          subtext={`${totalUnits} ${totalUnits === 1 ? "unit" : "units"}`}
          href="/properties"
          className="border-b border-r border-border md:border-b-0"
        />
        <MetricCard
          label="Occupancy"
          value={`${occupancyPercent}%`}
          subtext={`${occupiedUnits}/${totalUnits} occupied`}
          subtextVariant={vacantUnits > 0 ? "warning" : "success"}
          href="/reports"
          dotColor={vacantUnits > 0 ? "#EF9F27" : "#1D9E75"}
          className="border-b border-border md:border-b-0 md:border-r"
        />
        <MetricCard
          label="Monthly rent roll"
          value={collectionRate ? formatZARAbbrev(collectionRate.totalRentRoll) : "R 0"}
          subtext={`${formatZARAbbrev(feesDue.total_fees_due_cents)} fees`}
          href="/reports"
          className="border-r border-border"
        />
        <MetricCard
          label="Collection rate"
          value={collectionRate ? `${collectionRate.collectionRate}%` : "—"}
          progressBar={collectionRate?.collectionRate ?? 0}
          href="/billing"
          dotColor="#1D9E75"
        />
      </div>

      {/* Heavy sections — stream in via Suspense */}
      {collectionRate && (
        <Suspense fallback={<DashboardSectionsSkeleton />}>
          <DashboardHeavySections orgId={orgId} collectionRate={collectionRate} isOwner={tier === "owner"} />
        </Suspense>
      )}
        </>
      )}
    </div>
    </div>
    </>
  )
}
