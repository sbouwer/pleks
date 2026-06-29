/**
 * app/(landlord)/landlord/properties/[id]/page.tsx — Landlord portal property detail: units, maintenance, statements
 *
 * Route:  /landlord/properties/[id]
 * Auth:   getLandlordSession (token-gated landlord portal); verifies property.landlord_id matches
 * Data:   createServiceClient — units, leases, maintenance_requests, owner_statements
 * Notes:  Canon DetailPageLayout + DetailCard (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { notFound } from "next/navigation"
import Link from "next/link"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { Download } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { LandlordMaintenanceCard } from "@/components/portal/LandlordMaintenanceCard"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface Props {
  params: Promise<{ id: string }>
}

export default async function LandlordPropertyDetailPage({ params }: Props) {
  const { id: propertyId } = await params
  const session = await getLandlordSession()
  const service = await createServiceClient()

  // Verify property belongs to this landlord
  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("id, name, address_line1, suburb, city, property_type:type, landlord_id")
    .eq("id", propertyId)
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .single()
    logQueryError("LandlordPropertyDetailPage properties", propertyError)

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

  function deriveStatus(): DetailStatus {
    if (totalUnits === 0) return { kind: "neutral", label: "No units" }
    if (occupiedUnits === 0) return { kind: "vacant", label: "Vacant" }
    if (occupiedUnits >= totalUnits) return { kind: "occupied", label: "Fully let" }
    return { kind: "occupied", label: `${occupancyPct}% let` }
  }
  const status = deriveStatus()

  const facts: DetailFact[] = [
    { k: "Units", v: String(totalUnits) },
    { k: "Occupancy", v: `${occupancyPct}%` },
    { k: "Monthly rent", v: formatZAR(monthlyRent), mono: true },
  ]

  const address = [property.address_line1, property.suburb, property.city].filter(Boolean).join(", ")

  return (
    <DetailPageLayout
      category="Properties"
      backHref="/landlord/properties"
      title={property.name}
      status={status}
      sub={address || undefined}
      facts={facts}
    >
      {/* Units */}
      <DetailFullWidth>
        <DetailCard title="Units" flush>
          <div className="divide-y divide-border">
            {units.map((unit) => {
              const lease = leaseByUnit[unit.id]
              const tenant = lease?.tenant_view as unknown as { first_name: string; last_name: string } | null
              return (
                <div key={unit.id} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                  <div className="w-16 font-medium text-foreground">{unit.unit_number}</div>
                  <div className="flex-1 text-muted-foreground">
                    {[unit.bedrooms && `${unit.bedrooms} bed`, unit.bathrooms && `${unit.bathrooms} bath`].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="text-muted-foreground">
                    {tenant ? `${tenant.first_name} ${tenant.last_name[0]}.` : <span className="text-muted-foreground/60">Vacant</span>}
                  </div>
                  <div className="text-right font-medium text-foreground">
                    {lease?.rent_amount_cents ? formatZAR(lease.rent_amount_cents) : "—"}
                  </div>
                </div>
              )
            })}
          </div>
        </DetailCard>
      </DetailFullWidth>

      {/* Maintenance needing approval */}
      {pendingApproval.length > 0 && (
        <DetailFullWidth>
          <DetailCard title="Needs your approval">
            <div className="space-y-3">
              {pendingApproval.map((req) => (
                <LandlordMaintenanceCard key={req.id} req={req} showApproveActions />
              ))}
            </div>
          </DetailCard>
        </DetailFullWidth>
      )}

      {/* Active maintenance */}
      {activeMaint.length > 0 && (
        <DetailFullWidth>
          <DetailCard title="Active maintenance">
            <div className="space-y-1">
              {activeMaint.map((req) => (
                <Link key={req.id} href={`/landlord/maintenance/${req.id}`} className="group flex items-center gap-3 py-1.5">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${URGENCY_COLORS[req.urgency ?? "routine"]}`} />
                  <p className="flex-1 truncate text-sm text-foreground">{req.title}</p>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">{req.status.replace(/_/g, " ")}</span>
                </Link>
              ))}
            </div>
          </DetailCard>
        </DetailFullWidth>
      )}

      {/* Recent completed */}
      {recentCompleted.length > 0 && (
        <DetailFullWidth>
          <DetailCard title="Recently completed">
            <div className="space-y-1">
              {recentCompleted.map((req) => (
                <div key={req.id} className="flex items-center gap-3 py-1.5 text-sm text-muted-foreground">
                  <span className="text-success">✅</span>
                  <span className="flex-1 truncate">{req.title}</span>
                  {req.actual_cost_cents && <span className="shrink-0">{formatZAR(req.actual_cost_cents)}</span>}
                </div>
              ))}
            </div>
          </DetailCard>
        </DetailFullWidth>
      )}

      {/* Statements */}
      {statements.length > 0 && (
        <DetailFullWidth>
          <DetailCard title="Recent statements" action={{ label: "View all", href: "/landlord/statements" }} flush>
            <div className="divide-y divide-border">
              {statements.map((s) => {
                const period = new Date(s.period_month).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                    <span className="flex-1 text-muted-foreground">{period}</span>
                    <span className="font-medium text-foreground">{formatZAR(s.net_to_owner_cents)}</span>
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
          </DetailCard>
        </DetailFullWidth>
      )}
    </DetailPageLayout>
  )
}
