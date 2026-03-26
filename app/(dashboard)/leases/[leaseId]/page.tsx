import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { LeaseActions } from "./LeaseActions"
import { getLessorBankDetails } from "@/lib/leases/bankDetails"
import { AlertTriangle } from "lucide-react"
import { MigratedDocSection } from "./MigratedDocSection"

const STATUS_MAP: Record<string, "active" | "pending" | "draft" | "notice" | "cancelled"> = {
  draft: "draft",
  pending_signing: "pending",
  active: "active",
  notice: "notice",
  expired: "cancelled",
  cancelled: "cancelled",
  month_to_month: "active",
}

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ leaseId: string }>
}) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: lease } = await supabase
    .from("leases")
    .select("*, tenants(first_name, last_name, company_name, tenant_type, email, phone), units(unit_number, properties(name, address_line1, city))")
    .eq("id", leaseId)
    .single()

  if (!lease) notFound()

  const bankDetails = await getLessorBankDetails(lease.org_id)

  // Check for edited clauses
  const { count: editedClauseCount } = await supabase
    .from("lease_clause_selections")
    .select("id", { count: "exact", head: true })
    .eq("lease_id", leaseId)
    .not("custom_body", "is", null)

  const tenant = lease.tenants as unknown as { first_name: string; last_name: string; company_name: string; tenant_type: string; email: string; phone: string } | null
  const unit = lease.units as unknown as { unit_number: string; properties: { name: string; address_line1: string; city: string } } | null
  const tenantName = tenant?.tenant_type === "company"
    ? tenant.company_name
    : `${tenant?.first_name || ""} ${tenant?.last_name || ""}`.trim()

  const { data: amendments } = await supabase
    .from("lease_amendments")
    .select("*")
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/leases" className="hover:text-foreground">Leases</Link> &rsaquo; {tenantName}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl">{tenantName}</h1>
            <StatusBadge status={STATUS_MAP[lease.status] || "draft"} />
            {lease.migrated && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10" title="This lease was migrated from another system. No document is stored in Pleks.">
                Migrated lease
              </Badge>
            )}
            {!lease.migrated && lease.template_type === "custom" && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10" title="This lease was generated from your organisation's custom template.">
                Custom template
              </Badge>
            )}
            {!lease.migrated && lease.template_type !== "custom" && (editedClauseCount ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10" title="One or more clauses in this lease have been edited from standard Pleks wording.">
                Edited lease
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
          </p>
        </div>
        <LeaseActions leaseId={leaseId} status={lease.status} />
      </div>

      {!bankDetails.configured && lease.status === "draft" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-amber-200">
            Your trust account banking details are not configured.
            Add them in{" "}
            <Link href="/settings/compliance" className="underline hover:text-foreground">
              Settings → Banking
            </Link>{" "}
            before sending for signature. You can still save a draft.
          </p>
        </div>
      )}

      {/* Migrated lease document section */}
      {lease.migrated && (
        <MigratedDocSection
          leaseId={leaseId}
          externalDocPath={lease.external_document_path ?? null}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Lease Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{lease.lease_type}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize">{lease.status.replaceAll("_", " ")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Start Date</span><span>{lease.start_date}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">End Date</span><span>{lease.end_date || "Month to month"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Notice Period</span><span>{lease.notice_period_days} days</span></div>
            {lease.notice_given_date && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Notice Given</span><span>{lease.notice_given_date} by {lease.notice_given_by}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vacate By</span><span>{lease.notice_period_end}</span></div>
              </>
            )}
            {lease.signed_at && (
              <div className="flex justify-between"><span className="text-muted-foreground">Signed</span><span>{new Date(lease.signed_at).toLocaleDateString("en-ZA")}</span></div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPA Applies</span>
              <span>{lease.cpa_applies ? "Yes" : "No"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Rental Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly Rent</span>
              <span className="font-heading text-lg">{formatZAR(lease.rent_amount_cents)}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Due Day</span><span>{lease.payment_due_day}th of each month</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Escalation</span><span>{lease.escalation_percent}% ({lease.escalation_type})</span></div>
            {lease.escalation_review_date && (
              <div className="flex justify-between"><span className="text-muted-foreground">Next Escalation</span><span>{lease.escalation_review_date}</span></div>
            )}
            {lease.deposit_amount_cents && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span>{formatZAR(lease.deposit_amount_cents)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Interest To</span><span className="capitalize">{lease.deposit_interest_to}</span></div>
              </>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">DebiCheck</span>
              <span className="capitalize">{(lease.debicheck_mandate_status || "not_created").replaceAll("_", " ")}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Special terms */}
      {(lease.special_terms as unknown[])?.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Special Agreements (Addendum D)</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(lease.special_terms as { type: string; detail: string }[]).map((term, i) => (
                <li key={i} className="text-sm">
                  <span className="capitalize font-medium">{term.type.replaceAll("_", " ")}</span>
                  <span className="text-muted-foreground"> — {term.detail}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Amendments */}
      {amendments && amendments.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Amendments</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {amendments.map((a) => (
                <div key={a.id} className="text-sm flex items-center justify-between">
                  <div>
                    <span className="capitalize font-medium">{a.amendment_type.replaceAll("_", " ")}</span>
                    <span className="text-muted-foreground ml-2">Effective {a.effective_date}</span>
                  </div>
                  {a.signed_at && <StatusBadge status="completed" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
