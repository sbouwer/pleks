/**
 * app/(tenant)/tenant/page.tsx — Tenant portal dashboard: lease summary, payments, inspection, maintenance, emergency contact
 *
 * Route:  /tenant
 * Auth:   getTenantSession (token-gated tenant portal)
 * Data:   createServiceClient — rent_invoices, inspections, maintenance_requests, units, organisations, subscriptions
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { ReportIssueLink } from "./_components/ReportIssueLink"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import {
  AlertTriangle, CheckCircle2, Clock, Phone, Bell,
} from "lucide-react"
import { getTemplate } from "@/lib/comms/template-registry"
import { logQueryError } from "@/lib/supabase/logQueryError"

function isTemplateMandatory(key: string | null): boolean {
  if (!key) return false
  try { return getTemplate(key).is_mandatory ?? false } catch { return false }
}

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
  const [invoiceRes, , inspectionRes, maintenanceRes, unitRes, orgRes, subRes, unreadCommsRes] = await Promise.all([
    // Latest open invoice for balance + next payment
    service.from("rent_invoices")
      .select("id, invoice_date, due_date, total_amount_cents, balance_cents, payment_reference, status")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .in("status", ["open", "partial", "overdue"])
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
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
      .maybeSingle(),
    // Recent maintenance
    service.from("maintenance_requests")
      .select("id, title, category, status, created_at, urgency")
      .eq("tenant_id", tenantId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3),
    // Unit + property (including managing agent)
    service.from("units")
      .select("unit_number, properties(name, address_line1, city, managing_agent_id)")
      .eq("id", unitId)
      .single(),
    // Org emergency contact (fallback)
    service.from("organisations")
      .select("phone, emergency_phone, emergency_contact_name")
      .eq("id", orgId)
      .single(),
    // Subscription tier (determines emergency contact resolution)
    service.from("subscriptions")
      .select("tier")
      .eq("org_id", orgId)
      .eq("status", "active")
      .single(),
    // Unread mandatory comms — for banner (BUILD_63 Phase 8)
    service.from("communication_log")
      .select("id, template_key")
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound"),
  ])

  const invoice = invoiceRes.data
  const maintenance = maintenanceRes.data ?? []
  const inspection = inspectionRes.data
  const unit = unitRes.data
  const property = unit?.properties as unknown as { name: string; address_line1: string | null; city: string | null; managing_agent_id: string | null } | null

  const daysUntilDue = invoice?.due_date ? daysUntil(invoice.due_date) : null

  // Unread mandatory comms — filter those without a portal_view event
  const allComms = (unreadCommsRes.data ?? []) as { id: string; template_key: string | null }[]
  const mandatoryCommIds = allComms.filter((c) => isTemplateMandatory(c.template_key)).map((c) => c.id)
  let unreadMandatoryCount = 0
  if (mandatoryCommIds.length > 0) {
    const { data: viewedIds, error: viewedIdsError } = await service
      .from("communication_delivery_events")
      .select("communication_log_id")
      .in("communication_log_id", mandatoryCommIds)
      .eq("event_type", "portal_view")
    logQueryError("PortalDashboard communication_delivery_events", viewedIdsError)
    const viewed = new Set((viewedIds ?? []).map((r) => r.communication_log_id))
    unreadMandatoryCount = mandatoryCommIds.filter((id) => !viewed.has(id)).length
  }

  const orgData = orgRes.data as unknown as { phone: string | null; emergency_phone: string | null; emergency_contact_name: string | null } | null
  const subTier = (subRes.data as unknown as { tier: string } | null)?.tier ?? "owner"
  const isAgentTier = subTier === "portfolio" || subTier === "firm"

  // For Portfolio/Firm orgs: prefer the managing agent's personal emergency contact
  let emergencyPhone: string | null = orgData?.emergency_phone ?? orgData?.phone ?? null
  let emergencyContactName: string | null = orgData?.emergency_contact_name ?? null

  if (isAgentTier && property?.managing_agent_id) {
    const { data: agentProfile, error: agentProfileError } = await service
      .from("user_profiles")
      .select("emergency_phone, emergency_contact_name, full_name")
      .eq("id", property.managing_agent_id)
      .single()
    logQueryError("PortalDashboard user_profiles", agentProfileError)
    const agent = agentProfile as unknown as { emergency_phone: string | null; emergency_contact_name: string | null; full_name: string | null } | null
    if (agent?.emergency_phone) {
      emergencyPhone = agent.emergency_phone
      emergencyContactName = agent.emergency_contact_name ?? agent.full_name ?? null
    }
  }

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Tenant"
        title={`Welcome back, ${tenantName.split(" ")[0]}`}
        headline={property ? `${property.name} · ${unit?.unit_number ?? ""}` : "Your home"}
        sub={property?.address_line1 ?? undefined}
      />

      {unreadMandatoryCount > 0 && (
        <Link
          href="/tenant/communications"
          className="mb-4 flex items-center gap-3 rounded-[var(--r-button)] border border-warning/30 bg-warning/10 px-4 py-3 transition-colors hover:bg-warning/15"
        >
          <Bell className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              You have {unreadMandatoryCount} unread notice{unreadMandatoryCount > 1 ? "s" : ""} that require your attention.
            </p>
            <p className="text-xs text-muted-foreground">Review now →</p>
          </div>
        </Link>
      )}

      {emergencyPhone && (
        <a
          href={`tel:${emergencyPhone}`}
          className="mb-4 flex items-center gap-3 rounded-[var(--r-button)] border border-destructive/20 bg-destructive/5 px-4 py-3 transition-colors hover:bg-destructive/10"
        >
          <Phone className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">Emergency? Call {emergencyPhone}</p>
            <p className="text-xs text-muted-foreground">{emergencyContactName ?? "After-hours & weekends"}</p>
          </div>
        </a>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* Lease summary */}
        <Link href="/tenant/lease" className="block h-full">
          <DetailCard title="My lease">
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{property?.name ?? "Property"}</p>
              <p className="text-sm text-muted-foreground">
                {lease.start_date && new Date(lease.start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                {lease.end_date && ` – ${new Date(lease.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
              {lease.monthly_rent_cents && (
                <p className="text-sm font-medium text-foreground">{formatZAR(lease.monthly_rent_cents)}/month</p>
              )}
            </div>
          </DetailCard>
        </Link>

        {/* Next payment / outstanding */}
        <Link href="/tenant/payments" className="block h-full">
          <DetailCard title="Payments">
            {invoice ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Outstanding balance</p>
                    <p className={`font-heading text-xl ${balanceClass(invoice.balance_cents)}`}>
                      {formatZAR(invoice.balance_cents ?? 0)}
                    </p>
                  </div>
                  {invoice.status === "overdue" && (
                    <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-destructive" />
                  )}
                  {invoice.status !== "overdue" && invoice.balance_cents != null && invoice.balance_cents <= 0 && (
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success" />
                  )}
                </div>
                {daysUntilDue !== null && daysUntilDue >= 0 && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Due {daysUntilDue === 0 ? "today" : `in ${daysUntilDue} days`}
                    {invoice.payment_reference && ` · Ref: ${invoice.payment_reference}`}
                  </p>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Account clear
              </p>
            )}
          </DetailCard>
        </Link>

        {/* Upcoming inspection */}
        <DetailCard title="Next inspection">
          {inspection ? (
            <div className="space-y-1">
              <p className="font-medium capitalize text-foreground">{inspection.inspection_type.replaceAll("_", " ")} inspection</p>
              <p className="text-sm text-muted-foreground">
                {new Date(inspection.scheduled_date).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No inspections scheduled</p>
          )}
        </DetailCard>

        {/* Recent maintenance */}
        <DetailCard
          title="Maintenance"
          action={{ label: "All requests", href: "/tenant/maintenance" }}
          headerAction={<ReportIssueLink />}
        >
          {maintenance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests logged</p>
          ) : (
            <div className="space-y-2">
              {maintenance.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <p className="flex-1 truncate text-sm text-foreground">{m.title}</p>
                  <StatusBadge status={MAINTENANCE_STATUS_MAP[m.status] ?? "pending"} />
                </div>
              ))}
            </div>
          )}
        </DetailCard>

      </div>
    </div>
  )
}
