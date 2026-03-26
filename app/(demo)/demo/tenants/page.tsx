"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { Plus, Mail, Phone } from "lucide-react"

export default function DemoTenantsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">Tenants</h1>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Tenant
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.tenants.map((tenant) => {
          const unit = data.units.find((u) => u.id === tenant.unit_id)
          const property = unit ? data.properties.find((p) => p.id === unit.property_id) : null

          return (
            <Card key={tenant.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{tenant.full_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="size-3.5" />
                      <span>{tenant.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="size-3.5" />
                      <span>{tenant.phone}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {property && unit && (
                      <Badge variant="secondary">
                        {property.name} &middot; {unit.unit_number}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
