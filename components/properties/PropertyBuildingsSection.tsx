import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Pencil, Plus, AlertTriangle } from "lucide-react"

interface Building {
  id: string
  name: string
  building_type: string
  maintenance_rhythm: string
  heritage_status?: string | null
  insurance_renewal_date?: string | null
  insurance_provider?: string | null
  insurance_policy_number?: string | null
  is_primary: boolean
  is_visible_in_ui: boolean
  unitCount?: number
  occupiedCount?: number
}

interface Props {
  propertyId: string
  buildings: Building[]
}

const RHYTHM_LABELS: Record<string, string> = {
  standard: "Standard",
  heritage: "Heritage",
  new_build: "New build",
  industrial: "Industrial",
  custom: "Custom",
}

const TYPE_LABELS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  mixed_use: "Mixed use",
  industrial: "Industrial",
  heritage: "Heritage",
  heritage_commercial: "Heritage commercial",
  heritage_residential: "Heritage residential",
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function PropertyBuildingsSection({ propertyId, buildings }: Readonly<Props>) {
  const visible = buildings.filter((b) => b.is_visible_in_ui)
  const isMultiBuilding = visible.length > 1

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">
          {isMultiBuilding ? `Buildings (${visible.length})` : "Building"}
        </h2>
        <Button size="sm" render={<Link href={`/properties/${propertyId}/buildings/new`} />}>
          <Plus className="h-4 w-4 mr-1" /> Add building
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No buildings configured.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((b) => {
            const isHeritage = b.building_type.startsWith("heritage")
            const renewalDays = b.insurance_renewal_date ? daysUntil(b.insurance_renewal_date) : null
            const renewalWarning = renewalDays !== null && renewalDays <= 60

            return (
              <Card key={b.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium">{b.name}</span>
                          {b.building_type && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {TYPE_LABELS[b.building_type] ?? b.building_type}
                            </Badge>
                          )}
                          {isHeritage && (
                            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                              Heritage
                            </Badge>
                          )}
                          {b.is_primary && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Primary</Badge>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Maintenance: {RHYTHM_LABELS[b.maintenance_rhythm] ?? b.maintenance_rhythm}</p>
                          {b.unitCount !== undefined && (
                            <p>
                              {b.unitCount} {b.unitCount === 1 ? "unit" : "units"}
                              {b.occupiedCount !== undefined && ` · ${b.occupiedCount} occupied`}
                            </p>
                          )}
                          {b.insurance_provider && (
                            <p className="flex items-center gap-1">
                              Insurance: {b.insurance_provider}
                              {b.insurance_renewal_date && (
                                <span className={renewalWarning ? "text-warning font-medium" : ""}>
                                  {" "}· Renewal {new Date(b.insurance_renewal_date).toLocaleDateString("en-ZA")}
                                  {renewalWarning && renewalDays !== null && ` (${renewalDays}d)`}
                                </span>
                              )}
                              {renewalWarning && (
                                <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/properties/${propertyId}/buildings/${b.id}/edit`}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
