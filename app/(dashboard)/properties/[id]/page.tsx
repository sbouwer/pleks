import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { LandlordPicker } from "./LandlordPicker"
import { AgentPicker } from "./AgentPicker"
import { PropertyUnitsSection } from "@/components/properties/PropertyUnitsSection"
import { PropertyBuildingsSection } from "@/components/properties/PropertyBuildingsSection"
import { PropertyDocumentsSection } from "@/components/properties/PropertyDocumentsSection"
import { QuickActionsCard } from "@/components/properties/QuickActionsCard"
import { WelcomePackBanner } from "@/components/reports/WelcomePackBanner"
import { MobilePropertyView } from "@/components/mobile/MobilePropertyView"
import { ExternalLink, Pencil } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { BackLink } from "@/components/ui/BackLink"

function getInitials(firstName?: string | null, lastName?: string | null, companyName?: string | null): string {
  if (companyName) return companyName.slice(0, 2).toUpperCase()
  const f = firstName?.trim()[0] ?? ""
  const l = lastName?.trim()[0] ?? ""
  return (f + l).toUpperCase() || "?"
}

function displayName(row: { first_name?: string | null; last_name?: string | null; company_name?: string | null }): string {
  return row.company_name?.trim() || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown"
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")
  const { org_id: orgId, role } = membership
  const tier = membership.tier ?? "owner"

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single()

  if (!property) notFound()

  const service = await createServiceClient()

  const [
    { data: units },
    landlordResult,
    { data: allLandlords },
    { data: activeLeases },
    { data: maintenanceCounts },
    { data: teamMemberRows },
    { data: buildings },
    { data: propertyDocuments },
    { count: invoiceCount },
  ] = await Promise.all([
    supabase
      .from("units")
      .select("*")
      .eq("property_id", id)
      .is("deleted_at", null)
      .order("unit_number"),

    property.landlord_id
      ? supabase
          .from("landlord_view")
          .select("id, first_name, last_name, company_name, email, phone")
          .eq("id", property.landlord_id)
          .single()
      : Promise.resolve({ data: null }),

    service
      .from("landlord_view")
      .select("id, first_name, last_name, company_name, email, phone")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("first_name"),

    supabase
      .from("leases")
      .select("unit_id, id, tenant_id, tenants(id, contacts(id, first_name, last_name, company_name))")
      .eq("property_id", id)
      .in("status", ["active", "notice"])
      .is("deleted_at", null),

    supabase
      .from("maintenance_requests")
      .select("unit_id")
      .eq("property_id", id)
      .in("status", ["pending_review", "approved", "pending_landlord", "landlord_approved", "work_order_sent", "acknowledged", "in_progress", "pending_completion"]),

    service
      .from("user_orgs")
      .select("user_id, role, user_profiles(id, full_name)")
      .eq("org_id", orgId)
      .is("deleted_at", null),

    service
      .from("buildings")
      .select("id, name, building_type, maintenance_rhythm, heritage_status, insurance_renewal_date, insurance_provider, insurance_policy_number, is_primary, is_visible_in_ui")
      .eq("property_id", id)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false }),

    service
      .from("property_documents")
      .select("id, name, document_type, storage_path, expiry_date, notes, created_at")
      .eq("property_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),

    service
      .from("rent_invoices")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .eq("org_id", orgId),
  ])

  const landlord = landlordResult.data as {
    id: string
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    email?: string | null
    phone?: string | null
  } | null

  // Build agent lookup map: user_id → { id, name, initials, role }
  type AgentEntry = { id: string; name: string; initials: string; role: string }
  const agentMap: Record<string, AgentEntry> = {}
  for (const m of teamMemberRows || []) {
    const profile = m.user_profiles as unknown as { id: string; full_name: string | null }
    const name = profile?.full_name || "Unnamed"
    agentMap[m.user_id] = {
      id: m.user_id,
      name,
      initials: name.split(" ").map((w: string) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase(),
      role: m.role,
    }
  }

  // Team members for AgentPicker (client component)
  const teamMembers = (teamMemberRows || []).map((m) => {
    const profile = m.user_profiles as unknown as { full_name: string | null }
    return { userId: m.user_id, name: profile?.full_name || "Unnamed", role: m.role }
  })

  // Build tenant map: unit_id → tenant info
  const tenantByUnit: Record<string, { tenantId: string; contactId: string; name: string; initials: string }> = {}
  for (const lease of activeLeases || []) {
    const t = lease.tenants as unknown as { id: string; contacts: { id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null } } | null
    if (t?.contacts) {
      tenantByUnit[lease.unit_id] = {
        tenantId: t.id,
        contactId: t.contacts.id,
        name: displayName(t.contacts),
        initials: getInitials(t.contacts.first_name, t.contacts.last_name, t.contacts.company_name),
      }
    }
  }

  // Build maintenance count map
  const maintenanceByUnit: Record<string, number> = {}
  for (const req of maintenanceCounts || []) {
    maintenanceByUnit[req.unit_id] = (maintenanceByUnit[req.unit_id] || 0) + 1
  }

  const activeUnits = (units || []).filter((u) => !u.is_archived)
  const archivedUnits = (units || []).filter((u) => u.is_archived)
  const occupied = activeUnits.filter((u) => u.status === "occupied").length
  const vacantCount = activeUnits.filter((u) => u.status === "vacant").length
  const totalRentCents = activeUnits.reduce((sum, u) => sum + (u.asking_rent_cents || 0), 0)
  const totalMaintenanceCount = Object.values(maintenanceByUnit).reduce((s, n) => s + n, 0)

  const addressParts = [property.address_line1, property.suburb, property.city, property.province].filter(Boolean)
  const fullAddress = addressParts.join(", ")
  const mapsQuery = encodeURIComponent([...addressParts, "South Africa"].join(", "))
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`

  // Suppress unused variable warning — role available for future use
  void role

  const showWelcomeBanner = property.landlord_id && (invoiceCount ?? 0) < 2
  const landlordDisplayName = landlord
    ? (landlord.company_name?.trim() || [landlord.first_name, landlord.last_name].filter(Boolean).join(" ") || undefined)
    : undefined

  const mobileUnits = activeUnits.map((u) => ({
    id: u.id,
    unitNumber: u.unit_number,
    status: u.status,
    tenantName: tenantByUnit[u.id]?.name ?? null,
    rentCents: u.asking_rent_cents ?? 0,
    maintenanceCount: maintenanceByUnit[u.id] ?? 0,
  }))

  return (
    <div>
      <BackLink href="/properties" label="Properties" />
      {/* Mobile view */}
      <div className="lg:hidden">
        <MobilePropertyView
          propertyId={id}
          name={property.name}
          address={fullAddress}
          mapsUrl={googleMapsUrl}
          type={property.type ?? null}
          landlordName={landlord ? (landlord.company_name?.trim() || [landlord.first_name, landlord.last_name].filter(Boolean).join(" ") || null) : null}
          landlordPhone={landlord?.phone ?? null}
          totalUnits={activeUnits.length}
          occupiedUnits={occupied}
          vacantUnits={vacantCount}
          totalRentCents={totalRentCents}
          totalMaintenanceCount={totalMaintenanceCount}
          units={mobileUnits}
        />
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-heading text-3xl">{property.name}</h1>
            {property.type && (
              <Badge variant="secondary" className="capitalize">{property.type}</Badge>
            )}
          </div>
          <p className="text-muted-foreground">{fullAddress}</p>
          <AgentPicker
            propertyId={id}
            currentAgentId={property.managing_agent_id ?? null}
            teamMembers={teamMembers}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/properties/${id}/financials`} />}>
            Financials
          </Button>
          <Button variant="outline" render={<Link href={`/properties/${id}/edit`} />}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        </div>
      </div>

      {/* Welcome Pack banner for new properties */}
      {showWelcomeBanner && (
        <WelcomePackBanner orgId={orgId} landlordId={property.landlord_id!} landlordName={landlordDisplayName} />
      )}

      {/* Three-card row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">

        {/* Card 1: Landlord */}
        <Card>
          <div className="p-3 border-b">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Landlord</span>
          </div>
          <CardContent className="pt-4">
            <LandlordPicker
              propertyId={id}
              orgId={orgId}
              landlords={allLandlords ?? []}
              current={landlord}
            />
          </CardContent>
        </Card>

        {/* Card 2: Overview stats */}
        <Card>
          <div className="p-3 border-b">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Overview</span>
          </div>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total units</p>
                <p className="text-xl font-heading">{activeUnits.length}</p>
              </div>
              <div className="bg-surface rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Occupied</p>
                <p className="text-xl font-heading">
                  {occupied}<span className="text-sm text-muted-foreground font-normal">/{activeUnits.length}</span>
                </p>
              </div>
              <div className="bg-surface rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Vacant</p>
                <p className={cn("text-xl font-heading", vacantCount > 0 && "text-warning")}>{vacantCount}</p>
              </div>
              <div className="bg-surface rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Monthly rent</p>
                <p className="text-xl font-heading">{formatZAR(totalRentCents)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Map */}
        <Card className="relative overflow-hidden min-h-[220px]">
          <div className="hidden min-h-[220px]" aria-hidden="true" />
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 left-2 z-10 flex items-center gap-1 text-xs bg-background/90 backdrop-blur-sm border rounded px-2 py-1 hover:bg-background transition-colors"
          >
            Open in Maps <ExternalLink className="h-3 w-3" />
          </a>
          <iframe
            title="Property location"
            className="absolute inset-0 w-full h-full block"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed&z=15`}
          />
        </Card>

      </div>

      {/* Buildings section */}
      <PropertyBuildingsSection
        propertyId={id}
        buildings={buildings ?? []}
      />

      {/* Units section */}
      <PropertyUnitsSection
        units={activeUnits}
        archivedUnits={archivedUnits}
        propertyId={id}
        propertyName={property.name}
        propertyCity={property.city ?? null}
        propertyType={property.type ?? "residential"}
        tier={tier}
        managingAgentId={property.managing_agent_id ?? null}
        agentMap={agentMap}
        tenantByUnit={tenantByUnit}
        maintenanceByUnit={maintenanceByUnit}
        orgId={orgId}
      />

      {/* Property documents */}
      <div className="mt-6">
        <PropertyDocumentsSection
          propertyId={id}
          initialDocuments={propertyDocuments ?? []}
        />
      </div>

      {/* Quick actions */}
      <div className="mt-6">
        <QuickActionsCard
          propertyId={id}
          tier={tier}
          maintenanceCount={totalMaintenanceCount}
        />
      </div>
      </div>{/* end desktop */}
    </div>
  )
}
