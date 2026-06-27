/**
 * app/(landlord)/landlord/dashboard/page.tsx — Landlord portal dashboard: portfolio overview, maintenance approvals, expiring leases
 *
 * Route:  /landlord/dashboard
 * Auth:   getLandlordSession (token-gated landlord portal)
 * Data:   createServiceClient — properties, leases, maintenance_requests filtered by landlord_id
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import Link from "next/link"
import { InlineLink } from "@/components/ui/actions"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { formatZAR } from "@/lib/constants"
import { AlertTriangle, ChevronRight, CheckCircle2, Clock } from "lucide-react"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function LandlordDashboardPage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  // Properties owned by this landlord
  const { data: properties, error: propertiesError } = await service
    .from("properties")
    .select("id, name, units(count)")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .order("name")
    logQueryError("LandlordDashboardPage properties", propertiesError)

  const propertyIds = (properties ?? []).map((p) => p.id)

  // Active leases across all properties
  const { data: leases } = propertyIds.length > 0
    ? await service
        .from("leases")
        .select("id, rent_amount_cents, status, end_date, units(unit_number, properties(name)), tenant_view(first_name, last_name)")
        .in("property_id", propertyIds)
        .in("status", ["active", "notice", "month_to_month", "signed"])
        .is("deleted_at", null)
    : { data: [] }

  // Maintenance needing landlord attention
  const { data: pendingApproval } = propertyIds.length > 0
    ? await service
        .from("maintenance_requests")
        .select("id, title, urgency, estimated_cost_cents, quoted_cost_cents, landlord_approval_token, units(unit_number, properties(name)), contractor_view(company_name, first_name, last_name)")
        .in("property_id", propertyIds)
        .eq("status", "pending_landlord")
        .order("created_at")
    : { data: [] }

  // In-progress maintenance
  const { data: activeMaintenance } = propertyIds.length > 0
    ? await service
        .from("maintenance_requests")
        .select("id, title, urgency, status, created_at")
        .in("property_id", propertyIds)
        .in("status", ["approved", "work_order_sent", "acknowledged", "in_progress", "pending_completion"])
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] }

  // Leases expiring within 60 days
  const now = new Date()
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const expiringLeases = (leases ?? []).filter((l) => l.end_date && l.end_date <= in60Days && l.status !== "month_to_month")

  // Stats
  const totalUnits = (properties ?? []).reduce((sum, p) => sum + ((p.units as unknown as { count: number }[] | null)?.[0]?.count ?? 0), 0)
  const occupiedUnits = (leases ?? []).length
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
  const monthlyIncome = (leases ?? []).reduce((sum, l) => sum + (l.rent_amount_cents ?? 0), 0)

  const hour = new Date().getHours()
  let greeting: string
  if (hour < 12) { greeting = "Good morning" }
  else if (hour < 17) { greeting = "Good afternoon" }
  else { greeting = "Good evening" }
  const firstName = session.displayName.split(" ")[0]

  return (
    <div className="space-y-4">
      <ResourcePageHeader
        eyebrow="Landlord"
        title={`${greeting}, ${firstName}`}
        headline="Here's a summary of your portfolio."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Properties", value: String(properties?.length ?? 0) },
          { label: "Units", value: String(totalUnits) },
          { label: "Occupancy", value: `${occupancyPct}%` },
          { label: "Monthly income", value: formatZAR(monthlyIncome) },
        ].map((s) => (
          <div key={s.label} className="rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-heading text-2xl text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Needs attention */}
      {((pendingApproval?.length ?? 0) > 0 || expiringLeases.length > 0) && (
        <DetailCard title="Needs your attention">
          <div className="space-y-3">
            {(pendingApproval ?? []).map((req) => {
              const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
              const contractor = req.contractor_view as unknown as { company_name: string | null; first_name: string | null; last_name: string | null } | null
              const contractorName = contractor?.company_name || `${contractor?.first_name ?? ""} ${contractor?.last_name ?? ""}`.trim()
              const cost = req.quoted_cost_cents ?? req.estimated_cost_cents
              return (
                <div key={req.id} className="flex items-start gap-3 rounded-[var(--r-button)] border border-warning/20 bg-warning/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Maintenance approval needed</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {req.title}{unit ? ` — ${unit.unit_number}, ${unit.properties.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cost ? `Estimated: ${formatZAR(cost)}` : "No estimate yet"}
                      {contractorName ? ` · ${contractorName}` : ""}
                    </p>
                  </div>
                  <InlineLink href={`/landlord/maintenance/${req.id}`} className="shrink-0">
                    Review
                  </InlineLink>
                </div>
              )
            })}

            {expiringLeases.map((l) => {
              const unit = l.units as unknown as { unit_number: string; properties: { name: string } } | null
              const tenant = l.tenant_view as unknown as { first_name: string; last_name: string } | null
              const daysLeft = l.end_date ? Math.round((new Date(l.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
              return (
                <div key={l.id} className="flex items-start gap-3 rounded-[var(--r-button)] border border-info/20 bg-info/5 p-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Lease expiring{daysLeft != null ? ` in ${daysLeft} days` : ""}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                      {tenant ? ` — ${tenant.first_name} ${tenant.last_name[0]}.` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">Expires: {l.end_date ? new Date(l.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </DetailCard>
      )}

      {/* Active maintenance */}
      {(activeMaintenance?.length ?? 0) > 0 && (
        <DetailCard title="Active maintenance" action={{ label: "View all", href: "/landlord/maintenance" }}>
          <div className="space-y-1">
            {(activeMaintenance ?? []).map((req) => {
              let urgencyDot: string
              if (req.urgency === "emergency") { urgencyDot = "bg-danger" }
              else if (req.urgency === "urgent") { urgencyDot = "bg-warning" }
              else { urgencyDot = "bg-info" }
              return (
                <Link key={req.id} href={`/landlord/maintenance/${req.id}`} className="group flex items-center justify-between gap-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${urgencyDot}`} />
                    <p className="truncate text-sm text-foreground">{req.title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs capitalize text-muted-foreground">{req.status.replace(/_/g, " ")}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                  </div>
                </Link>
              )
            })}
          </div>
        </DetailCard>
      )}

      {/* All clear */}
      {(pendingApproval?.length ?? 0) === 0 && expiringLeases.length === 0 && (activeMaintenance?.length ?? 0) === 0 && (
        <div className="flex items-center gap-3 rounded-[var(--r-button)] border border-border bg-card px-5 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm text-muted-foreground">All clear — no items need your attention right now.</p>
        </div>
      )}
    </div>
  )
}
