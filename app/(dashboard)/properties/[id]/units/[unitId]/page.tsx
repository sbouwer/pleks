import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Pencil } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { UnitStatusActions } from "./UnitStatusActions"
import { UnitAgentPicker } from "./UnitAgentPicker"
import { UnitClauseProfile } from "@/components/leases/UnitClauseProfile"
import { ListingSection } from "./ListingSection"

export default async function UnitDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string; unitId: string }>
}>) {
  const { id, unitId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  const [
    { data: unit },
    membershipResult,
  ] = await Promise.all([
    supabase
      .from("units")
      .select("*, properties(name, managing_agent_id)")
      .eq("id", unitId)
      .single(),
    service
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single(),
  ])

  if (!unit) notFound()
  if (!membershipResult.data) redirect("/onboarding")

  const orgId = membershipResult.data.org_id

  const [
    { data: statusHistory },
    { data: teamMemberRows },
    { data: activeListing },
  ] = await Promise.all([
    supabase
      .from("unit_status_history")
      .select("*")
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false })
      .limit(10),
    service
      .from("user_orgs")
      .select("user_id, role, user_profiles(full_name)")
      .eq("org_id", orgId)
      .is("deleted_at", null),
    service
      .from("listings")
      .select("id, public_slug, status, asking_rent_cents, available_from, views_count, applications_count, created_at")
      .eq("unit_id", unitId)
      .in("status", ["active", "paused", "draft"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const property = unit.properties as unknown as { name: string; managing_agent_id: string | null }

  const teamMembers = (teamMemberRows || []).map((m) => {
    const profile = m.user_profiles as unknown as { full_name: string | null }
    return { userId: m.user_id, name: profile?.full_name || "Unnamed", role: m.role }
  })

  const statusMap: Record<string, "active" | "pending" | "open" | "scheduled" | "cancelled"> = {
    occupied: "active",
    notice: "pending",
    vacant: "open",
    maintenance: "scheduled",
    archived: "cancelled",
  }

  return (
    <div>
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/properties" className="hover:text-foreground">Properties</Link>
            {" "}&rsaquo;{" "}
            <Link href={`/properties/${id}`} className="hover:text-foreground">{property.name}</Link>
            {" "}&rsaquo; {unit.unit_number}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl">{unit.unit_number}</h1>
            <StatusBadge status={statusMap[unit.status] || "open"} />
          </div>
        </div>
        <Button variant="outline" render={<Link href={`/properties/${id}/units/${unitId}/edit`} />}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
      </div>

      {/* Status actions */}
      <UnitStatusActions unitId={unitId} propertyId={id} currentStatus={unit.status} />

      {/* Listing */}
      <div className="mt-6">
        <ListingSection
          unit={{ id: unitId, unit_number: unit.unit_number, asking_rent_cents: unit.asking_rent_cents }}
          property={{ id, name: property.name, city: (unit.properties as unknown as { city?: string | null })?.city }}
          orgId={orgId}
          activeListing={activeListing ?? null}
        />
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {unit.bedrooms !== null && <div className="flex justify-between"><span className="text-muted-foreground">Bedrooms</span><span>{unit.bedrooms}</span></div>}
            {unit.bathrooms !== null && <div className="flex justify-between"><span className="text-muted-foreground">Bathrooms</span><span>{unit.bathrooms}</span></div>}
            {unit.size_m2 && <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{unit.size_m2} m²</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Parking</span><span>{unit.parking_bays || 0} bays</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Furnished</span><span>{unit.furnished ? "Yes" : "No"}</span></div>
            {unit.floor !== null && <div className="flex justify-between"><span className="text-muted-foreground">Floor</span><span>{unit.floor}</span></div>}
            {(unit.features as string[])?.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1">Features</p>
                <div className="flex flex-wrap gap-1">
                  {(unit.features as string[]).map((f) => (
                    <span key={f} className="text-xs px-2 py-0.5 bg-surface-elevated rounded">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Financial</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {unit.asking_rent_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Asking Rent</span>
                <span className="font-heading text-lg">{formatZAR(unit.asking_rent_cents)}/mo</span>
              </div>
            )}
            {unit.deposit_amount_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deposit</span>
                <span>{formatZAR(unit.deposit_amount_cents)}</span>
              </div>
            )}
            {unit.market_rent_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Rent (AVM)</span>
                <span>{formatZAR(unit.market_rent_cents)}/mo</span>
              </div>
            )}
            {unit.notes && (
              <div>
                <p className="text-muted-foreground mb-1">Notes</p>
                <p className="text-foreground">{unit.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assigned agent */}
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-lg">Assigned agent</CardTitle></CardHeader>
        <CardContent>
          <UnitAgentPicker
            propertyId={id}
            unitId={unitId}
            currentAgentId={unit.assigned_agent_id ?? null}
            propertyManagerId={property.managing_agent_id}
            teamMembers={teamMembers}
          />
        </CardContent>
      </Card>

      {/* Clause profile */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            Unit clause overrides apply on top of the{" "}
            <Link href="/settings/lease-templates" className="underline underline-offset-2 hover:text-foreground">
              master lease template
            </Link>.
          </p>
        </div>
        <UnitClauseProfile
          unitId={unitId}
          propertyId={id}
          features={(unit.features as string[]) || []}
        />
      </div>

      {/* Status history */}
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-lg">Status History</CardTitle></CardHeader>
        <CardContent>
          {(!statusHistory || statusHistory.length === 0) ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <div className="space-y-3">
              {statusHistory.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                  <div className="flex-1">
                    {entry.from_status && (
                      <span className="capitalize">{entry.from_status}</span>
                    )}
                    {entry.from_status && " → "}
                    <span className="capitalize font-medium">{entry.to_status}</span>
                    {entry.reason && <span className="text-muted-foreground"> — {entry.reason}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString("en-ZA")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
