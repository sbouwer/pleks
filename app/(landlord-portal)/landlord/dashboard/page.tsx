import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import { AlertTriangle, ChevronRight, CheckCircle2, Clock } from "lucide-react"

export default async function LandlordDashboardPage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  // Properties owned by this landlord
  const { data: properties } = await service
    .from("properties")
    .select("id, name, unit_count")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .order("name")

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
  const totalUnits = (properties ?? []).reduce((sum, p) => sum + (p.unit_count ?? 0), 0)
  const occupiedUnits = (leases ?? []).length
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
  const monthlyIncome = (leases ?? []).reduce((sum, l) => sum + (l.rent_amount_cents ?? 0), 0)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = session.displayName.split(" ")[0]

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-3xl">{greeting}, {firstName}</h1>
        <p className="text-muted-foreground mt-1">Here&apos;s a summary of your portfolio.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Properties", value: String(properties?.length ?? 0) },
          { label: "Units", value: String(totalUnits) },
          { label: "Occupancy", value: `${occupancyPct}%` },
          { label: "Monthly income", value: formatZAR(monthlyIncome) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-surface-elevated px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{s.label}</p>
            <p className="font-heading text-2xl mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Needs attention */}
      {((pendingApproval?.length ?? 0) > 0 || expiringLeases.length > 0) && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Needs your attention</p>

          {(pendingApproval ?? []).map((req) => {
            const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
            const contractor = req.contractor_view as unknown as { company_name: string | null; first_name: string | null; last_name: string | null } | null
            const contractorName = contractor?.company_name || `${contractor?.first_name ?? ""} ${contractor?.last_name ?? ""}`.trim()
            const cost = req.quoted_cost_cents ?? req.estimated_cost_cents
            return (
              <div key={req.id} className="flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Maintenance approval needed</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {req.title}{unit ? ` — ${unit.unit_number}, ${unit.properties.name}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {cost ? `Estimated: ${formatZAR(cost)}` : "No estimate yet"}
                    {contractorName ? ` · ${contractorName}` : ""}
                  </p>
                </div>
                <Link href={`/landlord/maintenance/${req.id}`} className="text-xs text-brand hover:underline shrink-0">
                  Review →
                </Link>
              </div>
            )
          })}

          {expiringLeases.map((l) => {
            const unit = l.units as unknown as { unit_number: string; properties: { name: string } } | null
            const tenant = l.tenant_view as unknown as { first_name: string; last_name: string } | null
            const daysLeft = l.end_date ? Math.round((new Date(l.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
            return (
              <div key={l.id} className="flex items-start gap-3 p-3 rounded-lg bg-info/5 border border-info/20">
                <Clock className="h-4 w-4 text-info shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Lease expiring{daysLeft != null ? ` in ${daysLeft} days` : ""}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                    {tenant ? ` — ${tenant.first_name} ${tenant.last_name[0]}.` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Expires: {l.end_date ? new Date(l.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Active maintenance */}
      {(activeMaintenance?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Active maintenance</p>
            <Link href="/landlord/maintenance" className="text-xs text-brand hover:underline">View all</Link>
          </div>
          {(activeMaintenance ?? []).map((req) => (
            <Link key={req.id} href={`/landlord/maintenance/${req.id}`} className="flex items-center justify-between gap-3 py-1.5 group">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`h-2 w-2 rounded-full shrink-0 ${req.urgency === "emergency" ? "bg-danger" : req.urgency === "urgent" ? "bg-warning" : "bg-info"}`} />
                <p className="text-sm truncate">{req.title}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground capitalize">{req.status.replace(/_/g, " ")}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* All clear */}
      {(pendingApproval?.length ?? 0) === 0 && expiringLeases.length === 0 && (activeMaintenance?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <p className="text-sm text-muted-foreground">All clear — no items need your attention right now.</p>
        </div>
      )}
    </div>
  )
}
