"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { Building2, CheckCircle, Circle, Plus } from "lucide-react"

function PortalBadge({ status }: { status: "active" | "invited" | "none" }) {
  if (status === "active")  return <Badge className="bg-green-500/10 text-green-600 border-0">Portal active</Badge>
  if (status === "invited") return <Badge className="bg-amber-500/10 text-amber-600 border-0">Invite sent</Badge>
  return <Badge variant="secondary">No portal</Badge>
}

export default function DemoLandlordsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Landlords</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.landlords.length} owners</p>
        </div>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Landlord
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.landlords.map((landlord) => {
          const properties = data.properties.filter((p) => landlord.properties.includes(p.id))
          const totalUnits = properties.reduce((sum, p) => sum + p.units_count, 0)
          const totalIncome = properties.reduce((sum, p) => sum + p.monthly_income_cents, 0)

          return (
            <Card key={landlord.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={showDemoToast}>
              <CardContent className="pt-4 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{landlord.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{landlord.entity_type}</p>
                  </div>
                  <PortalBadge status={landlord.portal_status} />
                </div>

                {/* Contact */}
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>{landlord.email}</p>
                  <p>{landlord.phone}</p>
                </div>

                {/* Properties */}
                <div className="space-y-1">
                  {properties.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <Building2 className="size-3 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">{p.name}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{p.units_count} units</span>
                    </div>
                  ))}
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between border-t pt-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Units</p>
                    <p className="text-sm font-semibold">{totalUnits}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Monthly income</p>
                    <p className="text-sm font-semibold text-green-600">
                      R {(totalIncome / 100).toLocaleString("en-ZA")}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">FICA</p>
                    {landlord.fica_verified
                      ? <CheckCircle className="size-4 text-green-500 mx-auto" />
                      : <Circle className="size-4 text-muted-foreground mx-auto" />
                    }
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
