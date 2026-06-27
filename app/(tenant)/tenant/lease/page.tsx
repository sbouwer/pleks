/**
 * app/(tenant)/tenant/lease/page.tsx — tenant portal: the tenant's active lease overview
 *
 * Route:  /tenant/lease
 * Auth:   getTenantSession (redirects to /login); lease/unit/org all come from the session
 * Data:   units (+ properties) via the service client; deposit balance computed from the movement ledger
 * Notes:  Read-only. Canon DetailPageLayout + DetailCard (door style) — presentation only.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { computeDepositBalance } from "@/lib/deposits/depositBalance"
import { formatZAR } from "@/lib/constants"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import { ActionButton } from "@/components/ui/actions"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
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

function leaseStatus(s: string): DetailStatus {
  if (s === "active" || s === "month_to_month") return { kind: "occupied", label: s.replaceAll("_", " ") }
  if (s === "notice") return { kind: "vacant", label: "Notice period" }
  return { kind: "neutral", label: s.replaceAll("_", " ") }
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

function Row({ label, value, tone }: Readonly<{ label: string; value: string; tone?: "ok" }>) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === "ok" ? "text-right font-medium text-success" : "text-right font-medium text-foreground"}>{value}</span>
    </div>
  )
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

  const facts: DetailFact[] = []
  if (lease.monthly_rent_cents) facts.push({ k: "Monthly rent", v: formatZAR(lease.monthly_rent_cents), mono: true })
  if (lease.deposit_cents) facts.push({ k: "Deposit", v: formatZAR(lease.deposit_cents), mono: true })
  if (lease.end_date) facts.push({ k: "Term", v: termRemaining(lease.end_date) ?? "—" })

  return (
    <DetailPageLayout
      category="Home"
      backHref="/tenant"
      title="My lease"
      status={leaseStatus(lease.status)}
      facts={facts}
    >
      <DetailCard title="Property">
        <div>
          <p className="font-semibold text-foreground">{property?.name ?? "—"}</p>
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
      </DetailCard>

      <DetailCard title="Lease terms">
        <div className="space-y-2 text-sm">
          <Row label="Type" value={(lease.lease_type?.replaceAll("_", " ") ?? "Residential")} />
          {lease.start_date && <Row label="Start date" value={fmtDate(lease.start_date)} />}
          {lease.end_date && <Row label="End date" value={fmtDate(lease.end_date)} />}
          {lease.end_date && <Row label="Term" value={termRemaining(lease.end_date) ?? "—"} />}
        </div>
      </DetailCard>

      <DetailCard title="Financials">
        <div className="space-y-2 text-sm">
          {lease.monthly_rent_cents && <Row label="Monthly rent" value={formatZAR(lease.monthly_rent_cents)} />}
          {lease.payment_due_day && (
            <Row label="Payment due" value={`${lease.payment_due_day === 1 ? "1st" : `${lease.payment_due_day}th`} of each month`} />
          )}
          {lease.deposit_cents && <Row label="Deposit held" value={formatZAR(lease.deposit_cents)} />}
          {depositBalance != null && <Row label="Deposit (incl. interest)" value={formatZAR(depositBalance)} tone="ok" />}
        </div>
      </DetailCard>

      {(lease.escalation_rate || lease.next_escalation_date) && (
        <DetailCard title="Escalation">
          <div className="space-y-2 text-sm">
            {lease.escalation_rate && <Row label="Annual increase" value={`${lease.escalation_rate}%`} />}
            {lease.next_escalation_date && <Row label="Next review" value={fmtDate(lease.next_escalation_date)} />}
          </div>
        </DetailCard>
      )}

      {hasDocument && (
        <DetailFullWidth>
          <DetailCard title="Lease document">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Signed lease agreement</p>
                  <p className="text-xs text-muted-foreground">PDF document</p>
                </div>
              </div>
              <ActionButton asChild tone="secondary" size="sm">
                <Link href={`/api/portal/lease/${leaseId}/download`}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Download
                </Link>
              </ActionButton>
            </div>
          </DetailCard>
        </DetailFullWidth>
      )}
    </DetailPageLayout>
  )
}
