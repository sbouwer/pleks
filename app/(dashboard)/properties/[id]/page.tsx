import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { DoorOpen, Plus, Pencil, User } from "lucide-react"
import { formatZAR } from "@/lib/constants"

function contactDisplayName(row: { first_name?: string | null; last_name?: string | null; company_name?: string | null }) {
  return row.company_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown"
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

  const [{ data: units }, landlordResult, { data: activeLeases }] = await Promise.all([
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
      .select("unit_id, id, tenants(contacts(first_name, last_name, company_name))")
      .eq("property_id", id)
      .in("status", ["active", "notice"])
      .is("deleted_at", null),
  ])

  const landlord = landlordResult.data as {
    id: string; first_name?: string | null; last_name?: string | null;
    company_name?: string | null; email?: string | null; phone?: string | null
  } | null

  // Build a map of unit_id → tenant display name
  const tenantByUnit: Record<string, string> = {}
  for (const lease of activeLeases || []) {
    const tenant = lease.tenants as unknown as { contacts: { first_name?: string | null; last_name?: string | null; company_name?: string | null } } | null
    if (tenant?.contacts) {
      tenantByUnit[lease.unit_id] = contactDisplayName(tenant.contacts)
    }
  }

  const activeUnits = (units || []).filter((u) => !u.is_archived)
  const archivedUnits = (units || []).filter((u) => u.is_archived)
  const occupied = activeUnits.filter((u) => u.status === "occupied").length

  const statusMap: Record<string, "active" | "pending" | "open" | "scheduled" | "arrears"> = {
    occupied: "active",
    notice: "pending",
    vacant: "open",
    maintenance: "scheduled",
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/properties" className="hover:text-foreground">Properties</Link> &rsaquo; {property.name}
          </p>
          <h1 className="font-heading text-3xl">{property.name}</h1>
          <p className="text-muted-foreground">
            {property.address_line1}, {property.suburb ? `${property.suburb}, ` : ""}{property.city}, {property.province}
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/properties/${id}/edit`} />}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
      </div>

      {/* Stats + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 items-stretch">
        {/* 2×2 stat cards */}
        <div className="grid grid-cols-2 gap-4 content-start">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Active Units</p><p className="font-heading text-2xl">{activeUnits.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Occupied</p><p className="font-heading text-2xl">{occupied}/{activeUnits.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Vacant</p><p className="font-heading text-2xl">{activeUnits.filter((u) => u.status === "vacant").length}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Type</p><p className="font-heading text-2xl capitalize">{property.type}</p></CardContent></Card>
        </div>

        {/* Map */}
        <Card className="overflow-hidden h-full min-h-[220px]">
          <iframe
            title="Property location"
            className="block w-full h-full min-h-[220px]"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(
              [property.address_line1, property.suburb, property.city, property.province, "South Africa"]
                .filter(Boolean).join(", ")
            )}&output=embed&z=15`}
          />
        </Card>
      </div>

      {/* Landlord */}
      {landlord && (
        <div className="mb-6">
          <h2 className="text-lg font-medium mb-3">Landlord</h2>
          <Link href={`/landlords/${landlord.id}`}>
            <Card className="hover:border-brand/50 transition-colors cursor-pointer max-w-sm">
              <CardContent className="pt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-surface-elevated flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{contactDisplayName(landlord)}</p>
                  {(landlord.phone || landlord.email) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {landlord.phone || landlord.email}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Units */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Units</h2>
        <Button size="sm" render={<Link href={`/properties/${id}/units/new`} />}>
          <Plus className="h-4 w-4 mr-1" /> Add Unit
        </Button>
      </div>

      {activeUnits.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="h-8 w-8 text-muted-foreground" />}
          title="No units yet"
          description="Add units to this property to start managing tenants."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeUnits.map((unit) => (
            <Link key={unit.id} href={`/properties/${id}/units/${unit.id}`}>
              <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{unit.unit_number}</h3>
                    <StatusBadge status={statusMap[unit.status] || "open"} />
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {unit.bedrooms !== null && (
                      <p>{unit.bedrooms} bed · {unit.bathrooms ?? 0} bath{unit.size_m2 ? ` · ${unit.size_m2}m²` : ""}</p>
                    )}
                    {unit.asking_rent_cents && (
                      <p className="font-heading text-foreground">{formatZAR(unit.asking_rent_cents)}/mo</p>
                    )}
                    {tenantByUnit[unit.id] && (
                      <p className="flex items-center gap-1 text-xs pt-1 border-t border-border/40 mt-1">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{tenantByUnit[unit.id]}</span>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
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
