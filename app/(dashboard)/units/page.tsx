import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"

const STATUS_MAP: Record<string, "active" | "pending" | "cancelled"> = {
  occupied: "active",
  vacant: "pending",
  notice: "pending",
  maintenance: "pending",
}

export default async function UnitsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, status, letting_type, properties(id, name)")
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Units</h1>
      <p className="text-sm text-muted-foreground mb-4">{units?.length ?? 0} units across all properties</p>

      {(!units || units.length === 0) ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No units yet. Add units from a property&apos;s detail page.
        </p>
      ) : (
        <div className="space-y-2">
          {units.map((unit) => {
            const property = unit.properties as unknown as { id: string; name: string } | null
            return (
              <Link key={unit.id} href={`/properties/${property?.id}/units/${unit.id}`}>
                <Card className="hover:border-brand/30 transition-colors">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{unit.unit_number}</p>
                      <p className="text-xs text-muted-foreground">{property?.name ?? "Unknown property"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {unit.letting_type && (
                        <Badge variant="secondary" className="text-[10px]">{unit.letting_type}</Badge>
                      )}
                      <StatusBadge status={STATUS_MAP[unit.status] ?? "pending"} />
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
