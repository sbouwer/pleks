"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Plus, Mail, Phone, Briefcase } from "lucide-react"

type TenantStatus = "good_standing" | "in_arrears" | "on_notice"

const STATUS_CONFIG: Record<TenantStatus, { label: string; className: string }> = {
  good_standing: { label: "Good standing", className: "bg-green-500/10 text-green-600" },
  in_arrears:    { label: "In arrears",    className: "bg-red-500/10 text-red-600" },
  on_notice:     { label: "On notice",     className: "bg-amber-500/10 text-amber-600" },
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  debicheck: "DebiCheck",
  eft:       "EFT",
}

export default function DemoTenantsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.tenants.length} tenants</p>
        </div>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Tenant
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {data.tenants.map((tenant) => {
          const unit = data.units.find((u) => u.id === tenant.unit_id)
          const property = unit ? data.properties.find((p) => p.id === unit.property_id) : null
          const lease = data.leases.find((l) => l.tenant_id === tenant.id)
          const statusConfig = STATUS_CONFIG[tenant.status]

          return (
            <Card
              key={tenant.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={showDemoToast}
            >
              <CardContent className="pt-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{tenant.full_name}</p>
                    {property && unit && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {property.name} · Unit {unit.unit_number}
                      </p>
                    )}
                  </div>
                  <Badge className={`border-0 text-xs shrink-0 ${statusConfig.className}`}>
                    {statusConfig.label}
                  </Badge>
                </div>

                {/* Contact */}
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3 shrink-0" />
                    <span className="truncate">{tenant.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3 shrink-0" />
                    <span>{tenant.phone}</span>
                  </div>
                  {tenant.employer && (
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Briefcase className="size-3 shrink-0" />
                      <span>{tenant.employer}</span>
                    </div>
                  )}
                </div>

                {/* Lease summary */}
                {lease && (
                  <div className="flex items-center justify-between border-t pt-2 text-xs">
                    <span className="text-muted-foreground">
                      Rent {formatZAR(lease.rent_amount_cents)}/mo
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {PAYMENT_METHOD_LABEL[tenant.payment_method] ?? tenant.payment_method}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
