import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Download } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { LandlordMaintenanceCard } from "@/components/portal/LandlordMaintenanceCard"

interface Props {
  params: Promise<{ id: string }>
}

export default async function LandlordPropertyDetailPage({ params }: Props) {
  const { id: propertyId } = await params
  const session = await getLandlordSession()
  const service = await createServiceClient()

  // Verify property belongs to this landlord
  const { data: property } = await service
    .from("properties")
    .select("id, name, address_line1, suburb, city, unit_count, property_type, landlord_id")
    .eq("id", propertyId)
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .single()

  if (!property) notFound()

  const [unitsRes, leasesRes, maintRes, stmtRes] = await Promise.all([
    service
      .from("units")
      .select("id, unit_number, bedrooms, bathrooms")
      .eq("property_id", propertyId)
      .order("unit_number"),
    service
      .from("leases")
      .select("id, unit_id, rent_amount_cents, status, end_date, tenant_view(first_name, last_name)")
      .eq("property_id", propertyId)
      .in("status", ["active", "notice", "month_to_month", "signed"])
      .is("deleted_at", null),
    service
      .from("maintenance_requests")
      .select("id, title, urgency, status, estimated_cost_cents, quoted_cost_cents, actual_cost_cents, created_at, completed_at, landlord_approval_token, contractor_view(company_name, first_name, last_name)")
      .eq("property_id", propertyId)
      .not("status", "in", "(cancelled,rejected)")
      .order("created_at", { ascending: false })
      .limit(20),
    service
      .from("owner_statements")
      .select("id, period_month, gross_income_cents, total_expenses_cents, net_to_owner_cents, owner_payment_status, pdf_storage_path")
      .eq("property_id", propertyId)
      .eq("landlord_id", session.landlordId)
      .order("period_month", { ascending: false })
      .limit(6),
  ])

  const units = unitsRes.data ?? []
  const leases = leasesRes.data ?? []
  const maintenance = maintRes.data ?? []
  const statements = stmtRes.data ?? []

  const leaseByUnit: Record<string, typeof leases[number]> = {}
  for (const l of leases) leaseByUnit[l.unit_id] = l

  const totalUnits = units.length
  const occupiedUnits = leases.length
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
  const monthlyRent = leases.reduce((sum, l) => sum + (l.rent_amount_cents ?? 0), 0)

  const pendingApproval = maintenance.filter((m) => m.status === "pending_landlord")
  const activeMaint = maintenance.filter((m) => !["completed", "closed", "pending_landlord"].includes(m.status))
  const recentCompleted = maintenance.filter((m) => ["completed", "closed"].includes(m.status)).slice(0, 3)

  const URGENCY_COLORS: Record<string, string> = {
    emergency: "bg-danger", urgent: "bg-warning", routine: "bg-info", cosmetic: "bg-muted-foreground/40",
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/landlord/properties" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> Your properties
        </Link>
        <h1 className="font-heading text-3xl">{property.name}</h1>
        {[property.address_line1, property.suburb, property.city].filter(Boolean).join(", ") && (
          <p className="text-muted-foreground mt-1">{[property.address_line1, property.suburb, property.city].filter(Boolean).join(", ")}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Units", value: String(totalUnits) },
          { label: "Occupancy", value: `${occupancyPct}%` },
          { label: "Monthly rent", value: formatZAR(monthlyRent) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-surface-elevated px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{s.label}</p>
            <p className="font-heading text-xl mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Units */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Units</p>
        <div className="divide-y divide-border/60">
          {units.map((unit) => {
            const lease = leaseByUnit[unit.id]
            const tenant = lease?.tenant_view as unknown as { first_name: string; last_name: string } | null
            return (
              <div key={unit.id} className="py-2.5 flex items-center gap-4 text-sm">
                <div className="w-16 font-medium">{unit.unit_number}</div>
                <div className="flex-1 text-muted-foreground">
                  {[unit.bedrooms && `${unit.bedrooms} bed`, unit.bathrooms && `${unit.bathrooms} bath`].filter(Boolean).join(" · ") || "—"}
                </div>
                <div className="text-muted-foreground">
                  {tenant ? `${tenant.first_name} ${tenant.last_name[0]}.` : <span className="text-muted-foreground/60">Vacant</span>}
                </div>
                <div className="text-right font-medium">
                  {lease?.rent_amount_cents ? formatZAR(lease.rent_amount_cents) : "—"}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Maintenance needing approval */}
      {pendingApproval.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Needs your approval</p>
          {pendingApproval.map((req) => (
            <LandlordMaintenanceCard key={req.id} req={req} showApproveActions />
          ))}
        </div>
      )}

      {/* Active maintenance */}
      {activeMaint.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">Active maintenance</p>
          {activeMaint.map((req) => (
            <Link key={req.id} href={`/landlord/maintenance/${req.id}`} className="flex items-center gap-3 py-1.5 group">
              <div className={`h-2 w-2 rounded-full shrink-0 ${URGENCY_COLORS[req.urgency ?? "routine"]}`} />
              <p className="text-sm flex-1 truncate">{req.title}</p>
              <span className="text-xs text-muted-foreground capitalize shrink-0">{req.status.replace(/_/g, " ")}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Recent completed */}
      {recentCompleted.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">Recently completed</p>
          {recentCompleted.map((req) => (
            <div key={req.id} className="flex items-center gap-3 py-1.5 text-sm text-muted-foreground">
              <span className="text-success">✅</span>
              <span className="flex-1 truncate">{req.title}</span>
              {req.actual_cost_cents && <span className="shrink-0">{formatZAR(req.actual_cost_cents)}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Statements */}
      {statements.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Recent statements</p>
            <Link href="/landlord/statements" className="text-xs text-brand hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-border/60">
            {statements.map((s) => {
              const period = new Date(s.period_month).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
              return (
                <div key={s.id} className="py-2.5 flex items-center gap-4 text-sm">
                  <span className="flex-1 text-muted-foreground">{period}</span>
                  <span className="font-medium">{formatZAR(s.net_to_owner_cents)}</span>
                  <span className={`text-xs ${s.owner_payment_status === "paid" ? "text-success" : "text-muted-foreground"}`}>
                    {s.owner_payment_status === "paid" ? "Paid ✓" : "Pending"}
                  </span>
                  {s.pdf_storage_path && (
                    <a href={`/api/statements/${s.id}/download`} className="text-muted-foreground hover:text-foreground">
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
