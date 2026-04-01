import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { UnitRow } from "./UnitRow"
import { DoorOpen, ExternalLink, Pencil, Plus, Upload, User } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { cn } from "@/lib/utils"

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

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
    { data: activeLeases },
    { data: maintenanceCounts },
    agentProfileResult,
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

    property.managing_agent_id
      ? service
          .from("user_profiles")
          .select("id, full_name")
          .eq("id", property.managing_agent_id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const landlord = landlordResult.data as {
    id: string
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    email?: string | null
    phone?: string | null
  } | null

  const agentProfile = agentProfileResult.data as {
    id: string
    full_name: string | null
  } | null

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

  // Build maintenance count map: unit_id → count
  const maintenanceByUnit: Record<string, number> = {}
  for (const req of maintenanceCounts || []) {
    maintenanceByUnit[req.unit_id] = (maintenanceByUnit[req.unit_id] || 0) + 1
  }

  // Derive managing agent prop
  const managingAgent = agentProfile?.full_name
    ? {
        id: agentProfile.id,
        name: agentProfile.full_name,
        initials: agentProfile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      }
    : null

  const activeUnits = (units || []).filter((u) => !u.is_archived)
  const archivedUnits = (units || []).filter((u) => u.is_archived)
  const occupied = activeUnits.filter((u) => u.status === "occupied").length
  const vacantCount = activeUnits.filter((u) => u.status === "vacant").length
  const totalRentCents = activeUnits.reduce((sum, u) => sum + (u.asking_rent_cents || 0), 0)

  const addressParts = [property.address_line1, property.suburb, property.city, property.province].filter(Boolean)
  const fullAddress = addressParts.join(", ")
  const mapsQuery = encodeURIComponent([...addressParts, "South Africa"].join(", "))
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`

  const landlordName = landlord ? displayName(landlord) : null
  const landlordInitials = landlord ? getInitials(landlord.first_name, landlord.last_name, landlord.company_name) : null

  const waNumber = landlord?.phone?.replace(/\D/g, "").replace(/^0/, "27") ?? null

  return (
    <div>
      {/* Breadcrumb */}
      <p className="text-sm text-muted-foreground mb-1">
        <Link href="/properties" className="hover:text-foreground">Properties</Link> &rsaquo; {property.name}
      </p>

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
        </div>
        <Button variant="outline" render={<Link href={`/properties/${id}/edit`} />}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
      </div>

      {/* Three-card row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">

        {/* Card 1: Landlord */}
        <Card>
          <div className="p-3 border-b">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Landlord</span>
          </div>
          <CardContent className="pt-4">
            {landlord && landlordName ? (
              <>
                <Link href={`/landlords/${landlord.id}`} className="flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity">
                  <div className="h-10 w-10 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-medium shrink-0">
                    {landlordInitials}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{landlordName}</p>
                    <p className="text-xs text-muted-foreground">Owner</p>
                  </div>
                </Link>
                <div className="flex gap-2 flex-wrap">
                  {landlord.phone && (
                    <a href={`tel:${landlord.phone}`} className="flex-1 sm:flex-none">
                      <Button size="sm" variant="outline" className="w-full">Call</Button>
                    </a>
                  )}
                  {landlord.email && (
                    <a href={`mailto:${landlord.email}`} className="flex-1 sm:flex-none">
                      <Button size="sm" variant="outline" className="w-full">Email</Button>
                    </a>
                  )}
                  {landlord.phone && waNumber && (
                    <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
                      <Button size="sm" variant="outline" className="w-full">WhatsApp</Button>
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-4 space-y-3">
                <User className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No landlord assigned</p>
                <Button variant="outline" size="sm" render={<Link href={`/properties/${id}/edit`} />}>
                  Assign landlord
                </Button>
              </div>
            )}
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
        <Card className="overflow-hidden">
          <div className="relative h-full min-h-[220px]">
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
              className="w-full h-full min-h-[220px] block"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed&z=15`}
            />
          </div>
        </Card>

      </div>

      {/* Units section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Units</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<Link href="/settings/import" />}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Button size="sm" render={<Link href={`/properties/${id}/units/new`} />}>
            <Plus className="h-4 w-4 mr-1" /> Add Unit
          </Button>
        </div>
      </div>

      {/* Units list */}
      {activeUnits.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="h-8 w-8 text-muted-foreground" />}
          title="No units added yet"
          description="Add units individually or import in bulk from a spreadsheet."
        />
      ) : (
        <div className="space-y-2">
          {activeUnits.map((unit) => (
            <UnitRow
              key={unit.id}
              unit={unit}
              propertyId={id}
              tenant={tenantByUnit[unit.id] ?? null}
              managingAgent={managingAgent}
              maintenanceCount={maintenanceByUnit[unit.id] ?? 0}
            />
          ))}
        </div>
      )}

      {/* Archived units */}
      {archivedUnits.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Archived ({archivedUnits.length})</h3>
          <div className="space-y-2">
            {archivedUnits.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between p-3 rounded-lg bg-surface text-muted-foreground">
                <span className="text-sm">{unit.unit_number}</span>
                <StatusBadge status="cancelled" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
