import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Circle } from "lucide-react"
import { DashboardBanners } from "./DashboardBanners"

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

  // Get subscription
  const { data: sub } = orgId
    ? await supabase.from("subscriptions").select("tier").eq("org_id", orgId).eq("status", "active").single()
    : { data: null }

  const tier = sub?.tier || "owner"
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

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Dashboard</h1>

      <DashboardBanners showTrustBanner={showTrustBanner} />

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
