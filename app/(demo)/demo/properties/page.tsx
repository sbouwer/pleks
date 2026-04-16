"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Building2, ChevronDown, ChevronRight, Plus } from "lucide-react"


export default function DemoPropertiesPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">Properties</h1>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Property
        </button>
      </div>

      <div className="grid gap-4">
        {data.properties.map((property) => {
          const propertyUnits = data.units.filter((u) => u.property_id === property.id)
          const isExpanded = expanded === property.id

          return (
            <Card key={property.id}>
              <CardHeader
                className="cursor-pointer select-none"
                onClick={() => setExpanded(isExpanded ? null : property.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="size-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">{property.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {property.address_line1}, {property.suburb}, {property.city}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{property.type}</Badge>
                    <span className="text-sm text-muted-foreground">{property.units_count} units</span>
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="border-t pt-4 space-y-2">
                    <div className="grid grid-cols-4 gap-4 text-xs font-medium text-muted-foreground px-2">
                      <span>Unit</span>
                      <span>Bedrooms</span>
                      <span>Rent</span>
                      <span>Status</span>
                    </div>
                    {propertyUnits.map((unit) => (
                      <div
                        key={unit.id}
                        className="grid grid-cols-4 gap-4 items-center rounded-md px-2 py-1.5 text-sm hover:bg-surface-elevated transition-colors"
                      >
                        <span className="font-medium">{unit.unit_number}</span>
                        <span>{unit.bedrooms} bed</span>
                        <span>{formatZAR(unit.monthly_rental_cents)}/mo</span>
                        <Badge
                          variant="secondary"
                          className={unit.status === "occupied" ? "text-green-600 bg-green-500/10" : "text-amber-600 bg-amber-500/10"}
                        >
                          {unit.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
