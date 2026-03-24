import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Building2, Plus } from "lucide-react"

export default async function PropertiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, address_line1, city, province, type, units(id, status, is_archived)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  const props = properties || []

  const totalUnits = props.reduce((sum, p) => {
    const active = ((p.units as unknown[]) || []).filter((u: { is_archived: boolean; status: string }) => !u.is_archived)
    return sum + active.length
  }, 0)

  const occupiedUnits = props.reduce((sum, p) => {
    const occupied = ((p.units as unknown[]) || []).filter((u: { is_archived: boolean; status: string }) => u.status === "occupied" && !u.is_archived)
    return sum + occupied.length
  }, 0)

  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Properties</h1>
          {props.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {props.length} properties &middot; {totalUnits} active units &middot; {occupancyRate}% occupied
            </p>
          )}
        </div>
        <Button render={<Link href="/properties/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Add Property
        </Button>
      </div>

      {props.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first property to get started."
          action={{ label: "Add Property", onClick: () => {} }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {props.map((property) => {
            const units = (property.units as unknown as { id: string; status: string; is_archived: boolean }[]) || []
            const activeUnits = units.filter((u) => !u.is_archived)
            const occupied = activeUnits.filter((u) => u.status === "occupied").length

            return (
              <Link key={property.id} href={`/properties/${property.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer h-full">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{property.name}</h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {property.address_line1}, {property.city}
                        </p>
                      </div>
                      <span className="text-xs capitalize text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded ml-2">
                        {property.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-sm">{activeUnits.length} units</span>
                      {activeUnits.length > 0 && (
                        <StatusBadge
                          status={occupied === activeUnits.length ? "active" : occupied > 0 ? "pending" : "open"}
                        />
                      )}
                      {activeUnits.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {occupied}/{activeUnits.length} occupied
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
