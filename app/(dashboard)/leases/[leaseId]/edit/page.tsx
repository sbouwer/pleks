/**
 * app/(dashboard)/leases/[leaseId]/edit/page.tsx — edit a draft lease's terms
 *
 * Route:  /leases/[leaseId]/edit
 * Auth:   gatewaySSR() — agent session + org membership; the save goes through updateDraftLeaseTerms
 *         (requireAgentWriteAccess)
 * Data:   leases (org-scoped) with its unit and property for the heading
 * Notes:  The target of "Edit lease" on the details tab, the activation prerequisites and the incomplete-import banner,
 *         all of which linked here before the route existed (arc 2: dead link). Only a draft is editable; any other
 *         status goes back to the lease, where amendments live.
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect, notFound } from "next/navigation"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"
import { LeaseTermsForm } from "./LeaseTermsForm"

/** Rand amount for a form field — "" when unset, never a formatted string the parser would refuse. */
const rands = (cents: number | null | undefined) => (cents == null ? "" : String(cents / 100))

export default async function EditLeasePage({ params }: Readonly<{ params: Promise<{ leaseId: string }> }>) {
  const { leaseId } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { data: lease, error } = await gw.db
    .from("leases")
    .select("id, status, start_date, end_date, is_fixed_term, rent_amount_cents, deposit_amount_cents, payment_due_day, escalation_percent, escalation_type, notice_period_days, generated_doc_path, external_document_path, units(unit_number, properties(name))")
    .eq("id", leaseId)
    .eq("org_id", gw.orgId)
    .maybeSingle()
  logQueryError("EditLeasePage leases", error)
  if (!lease) notFound()
  if (lease.status !== "draft") redirect(`/leases/${leaseId}?tab=details`)

  const unit = lease.units as unknown as { unit_number: string | null; properties: { name: string | null } | null } | null
  const backHref = `/leases/${leaseId}?tab=details`

  return (
    <div className="max-w-2xl">
      <BackLink href={backHref} label="Lease" />
      <h1 className="font-heading text-2xl font-bold mb-1">Edit lease terms</h1>
      <p className="text-sm text-muted-foreground mb-6">{formatPropertyLabel(unit)}</p>
      <LeaseTermsForm
        leaseId={leaseId}
        backHref={backHref}
        hasGeneratedDocument={lease.generated_doc_path != null}
        hasUploadedDocument={lease.external_document_path != null}
        defaults={{
          startDate: (lease.start_date as string | null) ?? "",
          endDate: (lease.end_date as string | null) ?? "",
          isFixedTerm: lease.is_fixed_term !== false,
          rent: rands(lease.rent_amount_cents as number | null),
          deposit: rands(lease.deposit_amount_cents as number | null),
          paymentDueDay: String(lease.payment_due_day ?? "1"),
          escalationPercent: lease.escalation_percent == null ? "" : String(lease.escalation_percent),
          escalationType: (lease.escalation_type as string | null) ?? "fixed",
          noticePeriodDays: lease.notice_period_days == null ? "" : String(lease.notice_period_days),
        }}
      />
    </div>
  )
}
