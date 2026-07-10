/**
 * app/(supplier)/supplier/jobs/[requestId]/page.tsx — Supplier job detail (incl. tenant contact)
 *
 * Route:  /supplier/jobs/[requestId]
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   maintenance_requests (joins tenant_view) + quotes + photos via service; the request is
 *         scoped to session.contractorId so a supplier can only open their OWN assigned jobs.
 * Notes:  Canon DetailPageLayout + DetailCard (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { formatZAR } from "@/lib/constants"
import { JobStatusActions } from "./JobStatusActions"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { SA_TIMEZONE } from "@/lib/dates"

const STATUS_LABELS: Record<string, string> = {
  pending_quote: "Quote requested",
  quote_submitted: "Quote submitted",
  quote_approved: "Quote approved",
  quote_rejected: "Quote rejected",
  work_order_sent: "New — acknowledge",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  pending_completion: "Completion pending",
  completed: "Completed",
  closed: "Closed",
}

function jobStatus(s: string): DetailStatus {
  const label = STATUS_LABELS[s] ?? s.replace(/_/g, " ")
  if (["completed", "closed", "quote_approved"].includes(s)) return { kind: "occupied", label }
  if (["quote_rejected"].includes(s)) return { kind: "flag", label }
  if (["work_order_sent", "pending_quote", "pending_completion"].includes(s)) return { kind: "vacant", label }
  return { kind: "neutral", label }
}

export default async function ContractorJobDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  const supabase = await createServiceClient()

  const { data: job, error: jobError } = await supabase
    .from("maintenance_requests")
    .select(`
      id, title, description, status, urgency, category,
      work_order_number, created_at, scheduled_date, scheduled_time_from,
      access_instructions, special_instructions,
      estimated_cost_cents, quoted_cost_cents, actual_cost_cents,
      properties(name, address_line1, city),
      units(unit_number),
      tenant_view(first_name, last_name, phone)
    `)
    .eq("id", requestId)
    .eq("contractor_id", session.contractorId)
    .maybeSingle()
    logQueryError("ContractorJobDetailPage maintenance_requests", jobError)

  if (!job) redirect("/supplier/jobs")

  const prop = job.properties as unknown as { name: string; address_line1: string; city: string } | null
  const unit = job.units as unknown as { unit_number: string } | null
  const tenant = job.tenant_view as unknown as { first_name: string; last_name: string; phone: string } | null

  // Get quotes for this job
  const { data: quotes, error: quotesError } = await supabase
    .from("maintenance_quotes")
    .select("id, status, total_incl_vat_cents, submitted_at, rejection_reason")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    logQueryError("ContractorJobDetailPage maintenance_quotes", quotesError)

  // Get photos
  const { data: photos, error: photosError } = await supabase
    .from("maintenance_photos")
    .select("id, storage_path, caption, photo_phase")
    .eq("request_id", requestId)
    .order("created_at")
    logQueryError("ContractorJobDetailPage maintenance_photos", photosError)

  const tenantPhotos = (photos ?? []).filter((p) => p.photo_phase === "before")
  const latestQuote = (quotes ?? [])[0]

  const facts: DetailFact[] = [
    { k: "Property", v: `${unit?.unit_number ?? ""}, ${prop?.name ?? prop?.address_line1 ?? ""}` },
  ]
  if (job.work_order_number) facts.push({ k: "Ref", v: job.work_order_number, mono: true })
  if (job.category) facts.push({ k: "Category", v: job.category })
  if (job.scheduled_date) facts.push({ k: "Scheduled", v: new Date(job.scheduled_date).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }) })
  if (job.estimated_cost_cents) facts.push({ k: "Estimate", v: formatZAR(job.estimated_cost_cents), mono: true })

  return (
    <DetailPageLayout
      category="Jobs"
      backHref="/supplier/jobs"
      title={job.title}
      status={jobStatus(job.status)}
      badge={job.urgency ? (
        <span className="rounded-[var(--r-button)] border border-border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] capitalize text-muted-foreground">
          {job.urgency}
        </span>
      ) : undefined}
      facts={facts}
    >
      {/* Property & contact */}
      <DetailCard title="Property & contact">
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Property</p>
            <p className="font-medium text-foreground">{unit?.unit_number}, {prop?.name ?? prop?.address_line1}, {prop?.city}</p>
          </div>
          {tenant && (
            <div>
              <p className="text-xs text-muted-foreground">Tenant</p>
              <p className="text-foreground">{tenant.first_name} {tenant.last_name} — {tenant.phone}</p>
            </div>
          )}
        </div>
      </DetailCard>

      {/* Job description */}
      <DetailCard title="Job description">
        <p className="whitespace-pre-wrap text-sm text-foreground">{job.description}</p>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span>Category: {job.category}</span>
          {job.estimated_cost_cents && <span>Estimate: {formatZAR(job.estimated_cost_cents)}</span>}
        </div>
      </DetailCard>

      {/* Tenant photos */}
      {tenantPhotos.length > 0 && (
        <DetailCard title="Photos from tenant">
          <div className="grid grid-cols-2 gap-2">
            {tenantPhotos.map((p) => (
              <div key={p.id} className="flex aspect-square items-center justify-center rounded-[var(--r-button)] bg-muted text-xs text-muted-foreground">
                Photo
              </div>
            ))}
          </div>
        </DetailCard>
      )}

      {/* Access instructions */}
      {(job.access_instructions || job.special_instructions) && (
        <DetailCard title="Instructions">
          <div className="space-y-2 text-sm">
            {job.access_instructions && (
              <div>
                <p className="text-xs text-muted-foreground">Access</p>
                <p className="text-foreground">{job.access_instructions}</p>
              </div>
            )}
            {job.special_instructions && (
              <div>
                <p className="text-xs text-muted-foreground">Special instructions</p>
                <p className="text-foreground">{job.special_instructions}</p>
              </div>
            )}
          </div>
        </DetailCard>
      )}

      {/* Quote status */}
      {latestQuote && (
        <DetailCard title="Quote">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{formatZAR(latestQuote.total_incl_vat_cents)}</p>
              <p className="text-xs capitalize text-muted-foreground">{latestQuote.status}</p>
            </div>
            {latestQuote.status === "rejected" && latestQuote.rejection_reason && (
              <p className="text-xs text-destructive">Reason: {latestQuote.rejection_reason}</p>
            )}
          </div>
        </DetailCard>
      )}

      {/* Actions */}
      <DetailFullWidth>
        <JobStatusActions
          requestId={requestId}
          status={job.status}
        />
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
