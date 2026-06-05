/**
 * app/(tenant)/tenant/lease/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { computeDepositBalance } from "@/lib/deposits/depositBalance"
import { formatZAR } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { ActionButton } from "@/components/ui/actions"
import { FileText, Download } from "lucide-react"

function termRemaining(endDate: string | null) {
  if (!endDate) return null
  const end = new Date(endDate)
  const now = new Date()
  if (end <= now) return "Expired"
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
  if (months <= 0) {
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} day${days === 1 ? "" : "s"} remaining`
  }
  return `${months} month${months === 1 ? "" : "s"} remaining`
}

export default async function PortalLeasePage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()
  const { leaseId, orgId, unitId, lease } = session

  const [unitRes, depositBalance] = await Promise.all([
    service.from("units")
      .select("unit_number, floor, properties(name, address_line1, suburb, city, province)")
      .eq("id", unitId)
      .single(),
    // deposit_transactions is a movement ledger (no balance column) — compute the held balance
    // (or the reconciliation figure once reconciled). Replaces the phantom-column throwing .single().
    computeDepositBalance(service, orgId, leaseId),
  ])

  const unit = unitRes.data
  const property = unit?.properties as unknown as {
    name: string; address_line1: string | null; suburb: string | null
    city: string | null; province: string | null
  } | null

  const hasDocument = lease.generated_doc_path || lease.external_document_path

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">My Lease</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Property */}
        <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Property</p>
          <div>
            <p className="font-semibold">{property?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              Unit {unit?.unit_number ?? "—"}
              {unit?.floor != null && `, Floor ${unit.floor}`}
            </p>
            {property?.address_line1 && (
              <p className="text-sm text-muted-foreground">
                {property.address_line1}
                {property.suburb && `, ${property.suburb}`}
                {property.city && `, ${property.city}`}
              </p>
            )}
          </div>
        </div>

        {/* Lease terms */}
        <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Lease terms</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{lease.lease_type?.replaceAll("_", " ") ?? "Residential"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="capitalize">{lease.status}</Badge>
            </div>
            {lease.start_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start date</span>
                <span>{new Date(lease.start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            )}
            {lease.end_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">End date</span>
                <span>{new Date(lease.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            )}
            {lease.end_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Term</span>
                <span className="font-medium">{termRemaining(lease.end_date)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Financials */}
        <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Financials</p>
          <div className="space-y-2 text-sm">
            {lease.monthly_rent_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly rent</span>
                <span className="font-semibold">{formatZAR(lease.monthly_rent_cents)}</span>
              </div>
            )}
            {lease.payment_due_day && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment due</span>
                <span>
                  {lease.payment_due_day === 1 ? "1st" : `${lease.payment_due_day}th`} of each month
                </span>
              </div>
            )}
            {lease.deposit_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deposit held</span>
                <span>{formatZAR(lease.deposit_cents)}</span>
              </div>
            )}
            {depositBalance != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deposit (incl. interest)</span>
                <span className="text-success font-medium">{formatZAR(depositBalance)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Escalation */}
        {(lease.escalation_rate || lease.next_escalation_date) && (
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Escalation</p>
            <div className="space-y-2 text-sm">
              {lease.escalation_rate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Annual increase</span>
                  <span>{lease.escalation_rate}%</span>
                </div>
              )}
              {lease.next_escalation_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next review</span>
                  <span>{new Date(lease.next_escalation_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Document download */}
      {hasDocument && (
        <div className="mt-4 rounded-xl border border-border/60 bg-card px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Signed lease agreement</p>
              <p className="text-xs text-muted-foreground">PDF document</p>
            </div>
          </div>
          <ActionButton asChild tone="secondary" size="sm">
            <Link href={`/api/portal/lease/${leaseId}/download`}>
              <Download className="h-4 w-4 mr-1.5" />
              Download
            </Link>
          </ActionButton>
        </div>
      )}
    </div>
  )
}
