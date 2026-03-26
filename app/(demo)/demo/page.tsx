"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Building2, FileText, AlertTriangle, Wrench } from "lucide-react"
import Link from "next/link"

export default function DemoDashboard() {
  const { data } = useDemoData()
  const [now] = useState(() => Date.now())

  const occupiedUnits = data.units.filter((u) => u.status === "occupied").length
  const expiringLeases = data.leases.filter((l) => {
    const daysLeft = Math.ceil((new Date(l.end_date).getTime() - now) / (1000 * 60 * 60 * 24))
    return daysLeft > 0 && daysLeft <= 60
  })
  const openMaintenance = data.maintenance.filter((m) => m.status === "open" || m.status === "in_progress").length

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Units</p>
            <p className="font-heading text-2xl">{data.units.length}</p>
            <p className="text-xs text-muted-foreground">{occupiedUnits} occupied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active Leases</p>
            <p className="font-heading text-2xl">{data.leases.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Trust Balance</p>
            <p className="font-heading text-2xl text-brand">{formatZAR(data.financials.trust_balance_cents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">In Arrears</p>
            <p className="font-heading text-2xl text-danger">{data.arrears_cases.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expiring leases */}
        {expiringLeases.length > 0 && (
          <Card className="border-amber-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="size-4 text-amber-500" />
                Leases expiring soon
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringLeases.map((l) => {
                const tenant = data.tenants.find((t) => t.id === l.tenant_id)
                const daysLeft = Math.ceil((new Date(l.end_date).getTime() - now) / (1000 * 60 * 60 * 24))
                return (
                  <Link key={l.id} href={`/demo/leases`} className="flex items-center justify-between text-sm hover:bg-surface-elevated rounded-md px-2 py-1.5 -mx-2 transition-colors">
                    <span>{tenant?.full_name}</span>
                    <Badge variant="secondary" className="text-amber-600 bg-amber-500/10">{daysLeft}d left</Badge>
                  </Link>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Outstanding */}
        {data.arrears_cases.length > 0 && (
          <Card className="border-danger/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="size-4 text-danger" />
                Arrears
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.arrears_cases.map((a) => (
                <Link key={a.id} href="/demo/payments" className="flex items-center justify-between text-sm hover:bg-surface-elevated rounded-md px-2 py-1.5 -mx-2 transition-colors">
                  <div>
                    <p className="font-medium">{a.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">{a.property_name} · {a.unit_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-danger font-medium">{formatZAR(a.total_arrears_cents)}</p>
                    <p className="text-xs text-muted-foreground">{a.days_overdue} days</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Maintenance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="size-4" />
              Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.maintenance.filter((m) => m.status !== "resolved").map((m) => (
              <Link key={m.id} href="/demo/maintenance" className="flex items-center justify-between text-sm hover:bg-surface-elevated rounded-md px-2 py-1.5 -mx-2 transition-colors">
                <div>
                  <p>{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.property_name} · {m.unit_number}</p>
                </div>
                <Badge variant="secondary" className={m.priority === "high" ? "text-danger" : ""}>{m.priority}</Badge>
              </Link>
            ))}
            <p className="text-xs text-muted-foreground">{openMaintenance} open tickets</p>
          </CardContent>
        </Card>

        {/* Properties overview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="size-4" />
              Properties
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.properties.map((p) => (
              <Link key={p.id} href="/demo/properties" className="flex items-center justify-between text-sm hover:bg-surface-elevated rounded-md px-2 py-1.5 -mx-2 transition-colors">
                <span>{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.units_count} units</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
