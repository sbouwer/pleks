import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { StatusBadge } from "@/components/shared/StatusBadge"
import {
  FileText, CreditCard, Wrench, ClipboardCheck,
  AlertTriangle, CheckCircle2, Clock,
} from "lucide-react"

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function balanceClass(cents: number | null) {
  if (!cents || cents <= 0) return "text-success"
  return cents > 0 ? "text-danger" : "text-muted-foreground"
}

const MAINTENANCE_STATUS_MAP: Record<string, "pending" | "active" | "completed" | "arrears"> = {
  pending_review: "pending",
  approved: "active",
  work_order_sent: "active",
  acknowledged: "active",
  in_progress: "active",
  pending_completion: "active",
  completed: "completed",
  closed: "completed",
  rejected: "arrears",
  cancelled: "arrears",
}

export default async function PortalDashboard() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()
  const { tenantId, leaseId, orgId, lease, unitId, tenantName } = session

  // Parallel data fetches
  const [invoiceRes, , inspectionRes, maintenanceRes, unitRes] = await Promise.all([
    // Latest open invoice for balance + next payment
    service.from("rent_invoices")
      .select("id, invoice_date, due_date, total_amount_cents, balance_cents, payment_reference, status")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .in("status", ["open", "partial", "overdue"])
      .order("due_date", { ascending: true })
      .limit(1)
      .single(),
    // Recent payments
    service.from("payments")
      .select("id, payment_date, amount_cents, payment_method, reference")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .order("payment_date", { ascending: false })
      .limit(3),
    // Upcoming inspection
    service.from("inspections")
      .select("id, inspection_type, scheduled_date")
      .eq("unit_id", unitId)
      .eq("org_id", orgId)
      .in("status", ["scheduled", "pending"])
      .gte("scheduled_date", new Date().toISOString().slice(0, 10))
      .order("scheduled_date", { ascending: true })
      .limit(1)
      .single(),
    // Recent maintenance
    service.from("maintenance_requests")
      .select("id, title, category, status, created_at, urgency")
      .eq("tenant_id", tenantId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3),
    // Unit details
    service.from("units")
      .select("unit_number, properties(name, address_line1, city)")
      .eq("id", unitId)
      .single(),
  ])

  const invoice = invoiceRes.data
  const maintenance = maintenanceRes.data ?? []
  const inspection = inspectionRes.data
  const unit = unitRes.data
  const property = unit?.properties as unknown as { name: string; address_line1: string | null; city: string | null } | null

  const daysUntilDue = invoice?.due_date ? daysUntil(invoice.due_date) : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-3xl">Welcome back, {tenantName.split(" ")[0]}</h1>
        {property && (
          <p className="text-sm text-muted-foreground mt-1">
            {property.name} · {unit?.unit_number}
            {property.address_line1 && ` · ${property.address_line1}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Lease summary */}
        <Link href="/portal/lease" className="block">
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-2 hover:border-brand/40 transition-colors h-full">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5" />
              My Lease
            </div>
            <p className="font-semibold">{property?.name ?? "Property"}</p>
            <p className="text-sm text-muted-foreground">
              {lease.start_date && new Date(lease.start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
              {lease.end_date && ` – ${new Date(lease.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
            {lease.monthly_rent_cents && (
              <p className="text-sm font-medium">{formatZAR(lease.monthly_rent_cents)}/month</p>
            )}
          </div>
        </Link>

        {/* Next payment / outstanding */}
        <Link href="/portal/payments" className="block">
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-2 hover:border-brand/40 transition-colors h-full">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <CreditCard className="h-3.5 w-3.5" />
              Payments
            </div>
            {invoice ? (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Outstanding balance</p>
                    <p className={`text-xl font-heading ${balanceClass(invoice.balance_cents)}`}>
                      {formatZAR(invoice.balance_cents ?? 0)}
                    </p>
                  </div>
                  {invoice.status === "overdue" && (
                    <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-1" />
                  )}
                  {invoice.status !== "overdue" && invoice.balance_cents != null && invoice.balance_cents <= 0 && (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-1" />
                  )}
                </div>
                {daysUntilDue !== null && daysUntilDue >= 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due {daysUntilDue === 0 ? "today" : `in ${daysUntilDue} days`}
                    {invoice.payment_reference && ` · Ref: ${invoice.payment_reference}`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Account clear
              </p>
            )}
          </div>
        </Link>

        {/* Upcoming inspection */}
        <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Next Inspection
          </div>
          {inspection ? (
            <>
              <p className="font-medium capitalize">{inspection.inspection_type.replaceAll("_", " ")} inspection</p>
              <p className="text-sm text-muted-foreground">
                {new Date(inspection.scheduled_date).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No inspections scheduled</p>
          )}
        </div>

        {/* Recent maintenance */}
        <Link href="/portal/maintenance" className="block">
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-2 hover:border-brand/40 transition-colors h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                <Wrench className="h-3.5 w-3.5" />
                Maintenance
              </div>
              <Link
                href="/portal/maintenance/new"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-brand hover:underline"
              >
                Report issue
              </Link>
            </div>
            {maintenance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests logged</p>
            ) : (
              <div className="space-y-2 mt-1">
                {maintenance.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2">
                    <p className="text-sm truncate flex-1">{m.title}</p>
                    <StatusBadge status={MAINTENANCE_STATUS_MAP[m.status] ?? "pending"} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Link>

      </div>
    </div>
  )
}
