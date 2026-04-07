import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getServerOrgMembership, getServerUser } from "@/lib/auth/server"
import Link from "next/link"
import { Check, Circle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardBanners } from "./DashboardBanners"
import { MetricCard } from "./MetricCard"
import { AttentionQueue } from "./AttentionQueue"
import { FinancialsPanel } from "./FinancialsPanel"
import { LeaseExpiryTimeline } from "./LeaseExpiryTimeline"
import { ActivityFeed } from "./ActivityFeed"
import { formatZARAbbrev } from "@/lib/constants"
import { getFeesDue } from "@/lib/dashboard/feesDue"
import { getTrustBalance } from "@/lib/dashboard/trustBalance"
import { getUnpaidOwners } from "@/lib/dashboard/unpaidOwners"
import { getCollectionRate } from "@/lib/dashboard/collectionRate"
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

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>

async function getPortfolioCounts(supabase: SupabaseClient, orgId: string) {
  const [propRes, unitRes] = await Promise.all([
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    supabase.from("units").select("status, is_archived").eq("org_id", orgId).is("deleted_at", null).eq("is_archived", false),
  ])
  const activeUnits = unitRes.data ?? []
  return {
    totalProperties: propRes.count ?? 0,
    totalUnits: activeUnits.length,
    occupiedUnits: activeUnits.filter((u) => u.status === "occupied").length,
    vacantUnits: activeUnits.filter((u) => u.status === "vacant").length,
  }
}

const CHECKLIST = [
  { key: "org", label: "Organisation created", done: true },
  { key: "property", label: "Add your first property", href: "/properties" },
  { key: "unit", label: "Add a unit", href: "/properties" },
  { key: "tenant", label: "Add a tenant", href: "/tenants" },
  { key: "lease", label: "Create a lease", href: "/leases" },
  { key: "inspection", label: "Schedule a move-in inspection", href: "/inspections" },
]

export default async function DashboardPage() {
  const [membership, user] = await Promise.all([
    getServerOrgMembership(),
    getServerUser(),
  ])
  if (!membership || !user) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  // Org details + profile + subscription + portfolio counts all in parallel (wave 2)
  const [orgRes, profileRes, subRes, portfolioCounts] = await Promise.all([
    supabase
      .from("organisations")
      .select("has_trust_account, has_deposit_account, management_scope, founding_agent, founding_agent_price_cents")
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
    getPortfolioCounts(supabase, orgId),
  ])

  const org = orgRes.data as unknown as Record<string, unknown> | null
  const firstName = profileRes.data?.full_name?.split(" ")[0] ?? "there"
  const sub = subRes.data as SubRow
  const { totalProperties, totalUnits, occupiedUnits, vacantUnits } = portfolioCounts

  const greeting = getGreeting()
  const dateStr = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const tier = deriveTier(sub)
  const { isTrialing, trialEndsAt } = deriveTrialInfo(sub)
  const trialDaysLeft = computeTrialDaysLeft(trialEndsAt ?? null)

  const isNewOrg = totalProperties === 0
  const showTrustBanner = tier !== "owner" && org?.has_trust_account !== true
  const occupancyPercent = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  // All dashboard data in one Promise.all — no waterfalls
  const [
    collectionRate,
    feesDue,
    trustBalance,
    unpaidOwners,
    attentionItems,
    activityItems,
    expiringLeases,
    landlordsCountRes,
  ] = isNewOrg
    ? [null, null, null, null, [], [], [], { count: 0 }]
    : await Promise.all([
        getCollectionRate(orgId),
        getFeesDue(orgId),
        getTrustBalance(orgId),
        getUnpaidOwners(orgId),
        getAttentionItems(orgId),
        getActivityFeed(orgId),
        getExpiringLeases(orgId),
        supabase.from("landlord_view").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      ])

  const totalLandlords = (landlordsCountRes && "count" in landlordsCountRes) ? (landlordsCountRes.count ?? 0) : 0

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-2xl">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s your portfolio at a glance — {dateStr}
        </p>
      </div>

      {/* Banners */}
      <DashboardBanners
        showTrustBanner={showTrustBanner}
        isTrialing={isTrialing}
        trialDaysLeft={trialDaysLeft}
        trialTier={sub?.trial_tier}
        isFoundingAgent={!!org?.founding_agent}
        foundingPriceCents={org?.founding_agent_price_cents as number | null}
      />

      {/* Onboarding checklist */}
      {isNewOrg && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Welcome to Pleks! Get started:</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {CHECKLIST.map((item) => (
                <li key={item.key} className="flex items-center gap-3">
                  {item.done ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {item.href ? (
                    <Link href={item.href} className="text-sm hover:text-brand transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-sm">{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Five metric cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard
          label="Properties"
          value={String(totalProperties)}
          href="/properties"
        />
        <MetricCard
          label="Units"
          value={String(totalUnits)}
          href="/properties"
        />
        <MetricCard
          label="Occupancy"
          value={`${occupancyPercent}%`}
          subtext={vacantUnits > 0 ? `${vacantUnits} vacant` : "Fully occupied"}
          subtextVariant={vacantUnits > 0 ? "warning" : "success"}
          href="/reports"
        />
        <MetricCard
          label="Monthly rent roll"
          value={collectionRate ? formatZARAbbrev(collectionRate.totalRentRoll) : "R 0"}
          href="/reports"
        />
        <MetricCard
          label="Collection rate"
          value={collectionRate ? `${collectionRate.collectionRate}%` : "—"}
          progressBar={collectionRate?.collectionRate ?? 0}
          href="/payments"
        />
      </div>

      {/* Row 1: Attention queue + Financials */}
      {!isNewOrg && collectionRate && feesDue && trustBalance && unpaidOwners && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AttentionQueue items={attentionItems ?? []} />
          <FinancialsPanel
            collection={collectionRate}
            trustBalance={trustBalance}
            feesDue={feesDue}
            unpaidOwners={unpaidOwners}
            totalLandlords={totalLandlords}
          />
        </div>
      )}

      {/* Row 2: Lease expiry + Activity feed */}
      {!isNewOrg && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <LeaseExpiryTimeline leases={expiringLeases ?? []} />
          <ActivityFeed items={activityItems ?? []} />
        </div>
      )}
    </div>
  )
}
