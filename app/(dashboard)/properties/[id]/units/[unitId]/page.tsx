import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Calendar, Wrench, FileText } from "lucide-react"
import { UnitStatusActions } from "./UnitStatusActions"
import { UnitAgentPicker } from "./UnitAgentPicker"
import { UnitClauseProfile } from "@/components/leases/UnitClauseProfile"
import { ListingSection } from "./ListingSection"
import { DepositInterestConfig } from "@/components/deposits/DepositInterestConfig"
import { BackLink } from "@/components/ui/BackLink"
import { UnitForm } from "../UnitForm"
import { updateUnit } from "@/lib/actions/units"
import type { FurnishingItem } from "@/lib/units/furnishingTemplates"
import { getUnitDescription } from "@/lib/units/typeAwareFields"

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
    { data: primeRateRow },
    { data: furnishings },
    { data: activeLease },
    { data: profileRooms },
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
    supabase
      .from("prime_rates")
      .select("rate_percent")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("unit_furnishings")
      .select("category, item_name, quantity, condition, notes, is_custom")
      .eq("unit_id", unitId),
    supabase
      .from("leases")
      .select("id, end_date, status, tenants(id, contacts(first_name, last_name, company_name))")
      .eq("unit_id", unitId)
      .in("status", ["active", "notice"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("unit_inspection_profiles")
      .select("unit_inspection_profile_rooms(room_type, label, sort_order, is_custom)")
      .eq("unit_id", unitId)
      .maybeSingle(),
  ])

  const property = unit.properties as unknown as { name: string; managing_agent_id: string | null }

  const teamMembers = (teamMemberRows || []).map((m) => {
    const profile = m.user_profiles as unknown as { full_name: string | null }
    return { userId: m.user_id, name: profile?.full_name || "Unnamed", role: m.role }
  })

  // Members in UnitForm shape
  const formMembers = (teamMemberRows || []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    user_profiles: { full_name: (m.user_profiles as unknown as { full_name: string | null })?.full_name ?? null },
  }))

  const statusMap: Record<string, "active" | "pending" | "open" | "scheduled" | "cancelled"> = {
    occupied: "active",
    notice: "pending",
    vacant: "open",
    maintenance: "scheduled",
    archived: "cancelled",
  }

  // Profile rooms for the room list
  type ProfileRoomRow = { room_type: string; label: string; sort_order: number; is_custom: boolean }
  const savedRooms: ProfileRoomRow[] =
    (profileRooms?.unit_inspection_profile_rooms as unknown as ProfileRoomRow[] | null) ?? []

  // Furnishings mapped to FurnishingItem[]
  const mappedFurnishings: FurnishingItem[] = (furnishings ?? []).map((f) => ({
    category: f.category as FurnishingItem["category"],
    item_name: f.item_name,
    quantity: f.quantity ?? 1,
    condition: f.condition ?? undefined,
    notes: f.notes ?? undefined,
    is_custom: f.is_custom ?? false,
  }))

  // Active lease info for header + quick actions
  type LeaseRow = {
    id: string
    end_date: string | null
    status: string
    tenants: { id: string; contacts: { first_name?: string | null; last_name?: string | null; company_name?: string | null } } | null
  }
  const lease = activeLease as unknown as LeaseRow | null
  const leaseId = lease?.id ?? null
  const leaseTenant = lease?.tenants?.contacts
    ? (lease.tenants.contacts.company_name?.trim() ||
        [lease.tenants.contacts.first_name, lease.tenants.contacts.last_name].filter(Boolean).join(" ") ||
        null)
    : null
  const leaseEndDate = lease?.end_date
    ? new Date(lease.end_date).toLocaleDateString("en-ZA", { month: "short", year: "numeric" })
    : null

  const unitDescription = getUnitDescription(unit, "residential")

  // Bind updateUnit to this unit
  const boundAction = updateUnit.bind(null, unitId, id)

  return (
    <div>
      <BackLink href={`/properties/${id}`} label={property.name ?? "Property"} />

      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-3xl">{unit.unit_number}</h1>
          <StatusBadge status={statusMap[unit.status] || "open"} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {unitDescription}
          {leaseTenant && leaseEndDate && (
            <> · {leaseTenant} · Lease until {leaseEndDate}</>
          )}
          {leaseTenant && !leaseEndDate && (
            <> · {leaseTenant}</>
          )}
        </p>
      </div>

      {/* Status actions */}
      <UnitStatusActions unitId={unitId} propertyId={id} currentStatus={unit.status} />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-4 mb-6">
        <Button variant="outline" size="sm" render={<Link href={`/inspections/new?unitId=${unitId}`} />}>
          <Calendar className="h-3.5 w-3.5 mr-1.5" />
          Schedule inspection
        </Button>
        <Button variant="outline" size="sm" render={<Link href={`/maintenance/new?unitId=${unitId}`} />}>
          <Wrench className="h-3.5 w-3.5 mr-1.5" />
          Log maintenance
        </Button>
        {leaseId && (
          <Button variant="outline" size="sm" render={<Link href={`/leases/${leaseId}`} />}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            View lease
          </Button>
        )}
      </div>

      {/* Edit-in-place unit form */}
      <UnitForm
        action={boundAction}
        members={formMembers}
        defaultValues={{
          unit_number: unit.unit_number,
          unit_type: unit.unit_type ?? undefined,
          floor: unit.floor ?? undefined,
          size_m2: unit.size_m2 ? Number.parseFloat(unit.size_m2) : undefined,
          bedrooms: unit.bedrooms ?? undefined,
          bathrooms: unit.bathrooms ? Number.parseFloat(unit.bathrooms) : undefined,
          parking_bays: unit.parking_bays ?? 0,
          furnishing_status: unit.furnishing_status ?? "unfurnished",
          furnishings: mappedFurnishings,
          features: (unit.features as string[]) || [],
          asking_rent: unit.asking_rent_cents ? unit.asking_rent_cents / 100 : undefined,
          deposit_amount: unit.deposit_amount_cents ? unit.deposit_amount_cents / 100 : undefined,
          managed_by: unit.managed_by ?? undefined,
          notes: unit.notes ?? undefined,
          rooms: savedRooms,
        }}
      />

      {/* Listing */}
      <div className="mt-8">
        <ListingSection
          unit={{ id: unitId, unit_number: unit.unit_number, asking_rent_cents: unit.asking_rent_cents }}
          property={{ id, name: property.name, city: (unit.properties as unknown as { city?: string | null })?.city }}
          orgId={orgId}
          activeListing={activeListing ?? null}
        />
      </div>

      {/* Deposit interest config */}
      <div className="mt-6">
        <DepositInterestConfig
          unitId={unitId}
          currentPrime={primeRateRow?.rate_percent ?? null}
          title="Deposit interest — Unit override"
        />
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
        <div className="mb-2">
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
