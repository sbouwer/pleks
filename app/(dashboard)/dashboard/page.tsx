/**
 * app/(dashboard)/dashboard/page.tsx — Main dashboard: greeting, KPI strip, onboarding checklist, heavy data sections
 *
 * Route:  /dashboard
 * Auth:   getServerOrgMembership + getServerUser (redirects to /login if missing)
 * Data:   supabase client (light wave) + Suspense-streamed heavy sections (attentionItems, trustBalance, etc.)
 * Notes:  Light queries render immediately; heavy sections stream in behind DashboardSectionsSkeleton
 */
import { Suspense } from "react"
import { MobileHomeScreen } from "@/components/mobile/MobileHomeScreen"
import { createClient, getCachedServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getServerOrgMembership, getServerUser } from "@/lib/auth/server"
import { InlineLink } from "@/components/ui/actions"
import { Check, Circle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardBanners } from "./DashboardBanners"
import { MetricCard } from "./MetricCard"
import { AttentionQueue } from "./AttentionQueue"
import { FinancialsPanel } from "./FinancialsPanel"
import { LeaseExpiryTimeline } from "./LeaseExpiryTimeline"
import { ActivityFeed } from "./ActivityFeed"
import { PropertySetupCards } from "./PropertySetupCards"
import { GettingStarted, type GettingStartedProgress } from "./GettingStarted"
import { WorkspaceSetup } from "./WorkspaceSetup"
import { PlanUsageBanner } from "./PlanUsageBanner"
import { QuickAddMenu } from "./QuickAddMenu"
import { DashboardGreeting } from "./DashboardGreeting"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import type { Tier } from "@/lib/constants"
import { SurrenderedCommsWidget, type SurrenderedCommRow } from "./SurrenderedCommsWidget"
import { formatZARAbbrev } from "@/lib/constants"
import { getFeesDue } from "@/lib/dashboard/feesDue"
import { getTrustBalance } from "@/lib/dashboard/trustBalance"
import { getUnpaidOwners } from "@/lib/dashboard/unpaidOwners"
import { getCollectionRate, type CollectionRateData } from "@/lib/dashboard/collectionRate"
import { getAttentionItems } from "@/lib/dashboard/attentionItems"
import { getActivityFeed } from "@/lib/dashboard/activityFeed"
import { getExpiringLeases } from "@/lib/dashboard/leaseExpiry"
import { computeTrialDaysLeft } from "@/lib/trial/utils"

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
  const [feesDue, trustBalance, unpaidOwners, attentionItems, activityItems, expiringLeases, landlordsCountRes] =
    await Promise.all([
      getFeesDue(orgId),
      getTrustBalance(orgId),
      getUnpaidOwners(orgId),
      getAttentionItems(orgId),
      getActivityFeed(orgId),
      getExpiringLeases(orgId),
      getCachedServiceClient().then((c) =>
        c.from("landlord_view").select("id", { count: "exact", head: true }).eq("org_id", orgId)
      ),
    ])

  const totalLandlords = landlordsCountRes.count ?? 0

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
        <FinancialsPanel
          collection={collectionRate}
          trustBalance={trustBalance}
          feesDue={feesDue}
          unpaidOwners={unpaidOwners}
          totalLandlords={totalLandlords}
        />
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
  const [membership, user] = await Promise.all([
    getServerOrgMembership(),
    getServerUser(),
  ])
  if (!membership || !user) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  // Light wave — all independent, renders greeting + metrics immediately
  const [orgRes, profileRes, subRes, propCountRes, unitRes, collectionRate, tenantsCountRes, leasesCountRes, inspectionsCountRes, landlordsCountRes, contractorsCountRes, surrenderedCommsRes] = await Promise.all([
    supabase
      .from("organisations")
      .select("has_trust_account, has_deposit_account, management_scope, founding_agent, founding_agent_price_cents, onboarding_dismissed_at")
      .eq("id", orgId)
      .single(),
    supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("subscriptions")
      .select("tier, status, trial_tier, trial_ends_at, trial_converted")
      .eq("org_id", orgId)
      .in("status", ["active", "trialing"])
      .single(),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("units")
      .select("status, is_archived")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("is_archived", false),
    getCollectionRate(orgId),
    supabase.from("tenants").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    supabase.from("leases").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("inspections").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    getCachedServiceClient().then((c) => c.from("landlord_view").select("id", { count: "exact", head: true }).eq("org_id", orgId)),
    getCachedServiceClient().then((c) => c.from("contractors").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null)),
    // Surrendered mandatory comms requiring manual dispatch (BUILD_63 Phase 8)
    getCachedServiceClient().then((c) =>
      c.from("mandatory_comm_retries")
        .select("id, template_key, surrender_reason, surrendered_at, attempt_count, recipient_snapshot")
        .eq("org_id", orgId)
        .not("surrendered_at", "is", null)
        .limit(20)
    ),
  ])

  const org = orgRes.data as unknown as Record<string, unknown> | null
  const firstName = profileRes.data?.full_name?.split(" ")[0] ?? "there"
  const sub = subRes.data as SubRow
  const totalProperties = propCountRes.count ?? 0
  const activeUnits = unitRes.data ?? []
  const totalUnits = activeUnits.length
  const occupiedUnits = activeUnits.filter((u) => u.status === "occupied").length
  const vacantUnits = activeUnits.filter((u) => u.status === "vacant").length
  const occupancyPercent = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
  // Show onboarding until the org dismisses it (finished or skipped) — NOT derived from "has a
  // property", so a user who skips straight to the dashboard still gets the populated view.
  const onboardingDismissedAt = (org?.onboarding_dismissed_at as string | null) ?? null
  const showOnboarding = onboardingDismissedAt === null

  const onboardingProgress: GettingStartedProgress = {
    landlord:   (landlordsCountRes.count ?? 0) > 0,
    property:   totalProperties > 0,
    tenant:     (tenantsCountRes.count ?? 0) > 0,
    lease:      (leasesCountRes.count ?? 0) > 0,
    inspection: (inspectionsCountRes.count ?? 0) > 0,
    supplier:   (contractorsCountRes.count ?? 0) > 0,
  }

  const checklistItems: { key: string; label: string; done: boolean; href?: string }[] = [
    { key: "org",         label: "Organisation created",             done: true },
    { key: "property",    label: "Add your first property",          done: totalProperties > 0,              href: "/properties" },
    { key: "unit",        label: "Add a unit",                       done: totalUnits > 0,                   href: "/properties" },
    { key: "tenant",      label: "Add a tenant",                     done: (tenantsCountRes.count ?? 0) > 0, href: "/tenants" },
    { key: "lease",       label: "Create a lease",                   done: (leasesCountRes.count ?? 0) > 0,  href: "/leases" },
    { key: "inspection",  label: "Schedule a move-in inspection",    done: (inspectionsCountRes.count ?? 0) > 0, href: "/inspections" },
  ]
  const showChecklist = checklistItems.some((item) => !item.done)

  const greeting = getGreeting()
  const dateStr = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const tier = deriveTier(sub)
  const { isTrialing, trialEndsAt } = deriveTrialInfo(sub)
  const trialDaysLeft = computeTrialDaysLeft(trialEndsAt ?? null)
  const showTrustBanner = tier !== "owner" && org?.has_trust_account !== true

  type RetryRow = { id: string; template_key: string; surrender_reason: string | null; surrendered_at: string; attempt_count: number; recipient_snapshot: { email?: string; phone?: string } | null }
  const surrenderedCommItems: SurrenderedCommRow[] = ((surrenderedCommsRes.data ?? []) as RetryRow[]).map((r) => ({
    id:               r.id,
    template_key:     r.template_key,
    surrender_reason: r.surrender_reason,
    surrendered_at:   r.surrendered_at,
    attempt_count:    r.attempt_count,
    recipient_email:  r.recipient_snapshot?.email ?? null,
    recipient_name:   null,
  }))

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
        action={<QuickAddMenu orgId={orgId} />}
      />

      {/* Banners */}
      <DashboardBanners
        showTrustBanner={showTrustBanner}
        isTrialing={isTrialing}
        trialDaysLeft={trialDaysLeft}
        trialTier={sub?.trial_tier}
        isFoundingAgent={!!org?.founding_agent}
        foundingPriceCents={org?.founding_agent_price_cents as number | null}
      />

      {/* Surrendered mandatory comms widget (BUILD_63 Phase 8) */}
      <SurrenderedCommsWidget items={surrenderedCommItems} />

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
        orgId={membership.org_id}
        totalProperties={totalProperties}
        isAdmin={membership.role === "owner"}
      />

      {/* Onboarding checklist — shown until all steps complete */}
      {showChecklist && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Welcome to Pleks! Get started:</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {checklistItems.map((item) => (
                <li key={item.key} className="flex items-center gap-3">
                  {item.done ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {item.href && !item.done ? (
                    <InlineLink href={item.href}>
                      {item.label}
                    </InlineLink>
                  ) : (
                    <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tier-aware plan / usage banner */}
      <PlanUsageBanner tier={tier as Tier} leaseCount={leasesCountRes.count ?? 0} />

      {/* KPI strip — connected panel */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary md:grid-cols-5">
        <MetricCard
          label="Properties"
          value={String(totalProperties)}
          href="/properties"
          className="border-b border-r border-border md:border-b-0"
        />
        <MetricCard
          label="Units"
          value={String(totalUnits)}
          href="/properties"
          className="border-b border-border md:border-b-0 md:border-r"
        />
        <MetricCard
          label="Occupancy"
          value={`${occupancyPercent}%`}
          subtext={vacantUnits > 0 ? `${vacantUnits} vacant` : "Fully occupied"}
          subtextVariant={vacantUnits > 0 ? "warning" : "success"}
          href="/reports"
          dotColor={vacantUnits > 0 ? "#EF9F27" : "#1D9E75"}
          className="border-b border-r border-border md:border-b-0"
        />
        <MetricCard
          label="Monthly rent roll"
          value={collectionRate ? formatZARAbbrev(collectionRate.totalRentRoll) : "R 0"}
          href="/reports"
          className="border-b border-border md:border-b-0 md:border-r"
        />
        <MetricCard
          label="Collection rate"
          value={collectionRate ? `${collectionRate.collectionRate}%` : "—"}
          progressBar={collectionRate?.collectionRate ?? 0}
          href="/billing"
          dotColor="#1D9E75"
          className="col-span-2 md:col-span-1"
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
