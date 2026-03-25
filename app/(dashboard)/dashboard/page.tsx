import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Circle } from "lucide-react"
import { DashboardBanners } from "./DashboardBanners"
import { formatZAR } from "@/lib/constants"
import { getFeesDue } from "@/lib/dashboard/feesDue"
import { getTrustBalance } from "@/lib/dashboard/trustBalance"
import { getUnpaidOwners } from "@/lib/dashboard/unpaidOwners"
import { formatDateShort } from "@/lib/reports/periods"

const CHECKLIST = [
  { key: "org", label: "Organisation created", done: true },
  { key: "property", label: "Add your first property", href: "/properties" },
  { key: "unit", label: "Add a unit", href: "/properties" },
  { key: "tenant", label: "Add a tenant", href: "/tenants" },
  { key: "lease", label: "Create a lease", href: "/leases" },
  { key: "inspection", label: "Schedule a move-in inspection", href: "/inspections" },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Get org
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id, organisations(has_trust_account, has_deposit_account, management_scope)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  const orgId = membership?.org_id

  // Get subscription (including trial state)
  const { data: sub } = orgId
    ? await supabase.from("subscriptions").select("tier, status, trial_tier, trial_ends_at, trial_converted").eq("org_id", orgId).in("status", ["active", "trialing"]).single()
    : { data: null }

  const isTrialing = sub?.status === "trialing" && !sub?.trial_converted
  const trialEndsAt = isTrialing ? sub?.trial_ends_at : null
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : null

  // Effective tier (trial_tier during trial, otherwise tier)
  const tier = isTrialing && sub?.trial_tier ? sub.trial_tier : (sub?.tier || "owner")
  const org = membership?.organisations as unknown as Record<string, unknown> | null

  // Portfolio metrics
  let totalProperties = 0
  let totalUnits = 0
  let occupiedUnits = 0
  let vacantUnits = 0

  if (orgId) {
    const { count: propCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("deleted_at", null)

    totalProperties = propCount || 0

    const { data: units } = await supabase
      .from("units")
      .select("status, is_archived")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("is_archived", false)

    const activeUnits = units || []
    totalUnits = activeUnits.length
    occupiedUnits = activeUnits.filter((u) => u.status === "occupied").length
    vacantUnits = activeUnits.filter((u) => u.status === "vacant").length
  }

  const showTrustBanner = tier !== "owner" && org?.has_trust_account !== true
  const isNewOrg = totalProperties === 0

  // TPN gap widgets — load in parallel (only for non-new orgs)
  let feesDue = null
  let trustBalance = null
  let unpaidOwners = null

  if (orgId && !isNewOrg) {
    ;[feesDue, trustBalance, unpaidOwners] = await Promise.all([
      getFeesDue(orgId),
      getTrustBalance(orgId),
      getUnpaidOwners(orgId),
    ])
  }

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Dashboard</h1>

      <DashboardBanners
        showTrustBanner={showTrustBanner}
        isTrialing={isTrialing}
        trialDaysLeft={trialDaysLeft}
        trialTier={sub?.trial_tier}
      />

      {/* Welcome checklist for new users */}
      {isNewOrg && (
        <Card className="mb-6">
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

      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Properties</p>
            <p className="font-heading text-2xl">{totalProperties}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active Units</p>
            <p className="font-heading text-2xl">{totalUnits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Occupied</p>
            <p className="font-heading text-2xl">
              {occupiedUnits}
              {totalUnits > 0 && (
                <span className="text-sm text-muted-foreground ml-1">
                  ({Math.round((occupiedUnits / totalUnits) * 100)}%)
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Vacant</p>
            <p className="font-heading text-2xl">{vacantUnits}</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial widgets row — TPN gap additions */}
      {!isNewOrg && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Fees Due widget */}
          {feesDue && feesDue.total_fees_due_cents > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Fees Due — {feesDue.period_label}</p>
                <p className="font-heading text-xl mt-1">{formatZAR(feesDue.total_fees_due_cents)}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-600">Ready to release</span>
                    <span className="font-semibold">{formatZAR(feesDue.fees_in_collected_rent)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pending income</span>
                    <span>{formatZAR(feesDue.fees_in_uncollected_rent)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trust Balance widget */}
          {trustBalance && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Trust Account (calculated)</p>
                <p className="font-heading text-xl mt-1">{formatZAR(trustBalance.total_in_trust_cents)}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Undisbursed rent</span>
                    <span>{formatZAR(trustBalance.rent_collected_undisbursed_cents)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Deposits held</span>
                    <span>{formatZAR(trustBalance.deposits_held_cents)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Fees pending</span>
                    <span>{formatZAR(trustBalance.management_fees_pending_cents)}</span>
                  </div>
                </div>
                {trustBalance.last_recon_date && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last reconciled: {formatDateShort(new Date(trustBalance.last_recon_date))}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Pleks-calculated. Verify against your bank statement.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Unpaid Owners widget */}
          {unpaidOwners && unpaidOwners.count > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Owners Not Yet Paid</p>
                <p className="font-heading text-xl mt-1 text-amber-600">{unpaidOwners.count}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total: {formatZAR(unpaidOwners.total_unpaid_cents)}
                </p>
                <Button variant="outline" size="sm" className="mt-3 w-full text-xs" render={<Link href="/reports" />}>
                  View unpaid owners report
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick actions */}
      {!isNewOrg && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" render={<Link href="/properties/new" />}>
                Add Property
              </Button>
              <Button variant="outline" className="w-full justify-start" render={<Link href="/tenants" />}>
                Manage Tenants
              </Button>
              <Button variant="outline" className="w-full justify-start" render={<Link href="/leases" />}>
                View Leases
              </Button>
              <Button variant="outline" className="w-full justify-start" render={<Link href="/reports" />}>
                View Reports
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Activity feed coming in future builds.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
