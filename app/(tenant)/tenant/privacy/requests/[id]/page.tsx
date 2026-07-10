/**
 * app/(tenant)/tenant/privacy/requests/[id]/page.tsx — Request detail view (subject-side)
 *
 * Route:  /tenant/privacy/requests/:id
 * Auth:   Tenant portal session + subject ownership check
 * Data:   data_subject_requests (SELECT), popia_exports (SELECT for download link)
 * Notes:  Canon DetailPageLayout + DetailCard (door style) — presentation only.
 */
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { DetailPageLayout } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import { ActionButton } from "@/components/ui/actions"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { ExternalLink } from "lucide-react"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { SA_TIMEZONE } from "@/lib/dates"

const STATUS_LABELS: Record<string, string> = {
  new: "Received",
  verifying_identity: "Verifying identity",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
}

function reqStatus(s: string): DetailStatus {
  const label = STATUS_LABELS[s] ?? s
  if (s === "approved" || s === "completed") return { kind: "occupied", label }
  if (s === "rejected") return { kind: "flag", label }
  return { kind: "neutral", label }
}

export default async function RequestDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const db = createServiceClient()
  const { data: request, error: requestError } = await (await db)
    .from("data_subject_requests")
    .select("*")
    .eq("id", id)
    .single()
    logQueryError("RequestDetailPage data_subject_requests", requestError)

  if (!request) notFound()

  // Subject must own this request
  const isOwner =
    request.subject_user_id === user.id ||
    request.subject_email?.toLowerCase() === user.email?.toLowerCase()

  if (!isOwner) notFound()

  const sla = new Date(request.sla_deadline)
  const isOverdue = sla < new Date() && !["completed", "rejected", "cancelled"].includes(request.status)

  const facts: DetailFact[] = [
    { k: "Submitted", v: new Date(request.submitted_at).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }) },
    { k: "SLA deadline", v: sla.toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }) },
  ]

  return (
    <DetailPageLayout
      category="Privacy"
      backHref="/tenant/privacy/requests"
      title={`${request.request_type.replaceAll("_", " ")} request`}
      status={reqStatus(request.status)}
      badge={isOverdue ? (
        <span className="inline-flex items-center rounded-[var(--r-button)] border border-destructive/30 bg-destructive/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-destructive">
          Overdue
        </span>
      ) : undefined}
      facts={facts}
      actions={request.export_id ? (
        <ActionButton asChild tone="primary" size="sm">
          <Link href={`/api/popia/request/${request.id}/download`}>
            Download your data export <ExternalLink className="ml-2 size-4" />
          </Link>
        </ActionButton>
      ) : undefined}
    >
      <DetailCard title="Request status">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">SLA deadline</span>
            <span className={isOverdue ? "text-right font-medium text-destructive" : "text-right font-medium text-foreground"}>
              {sla.toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}{isOverdue && " — overdue"}
            </span>
          </div>
          {request.resolution_notes && (
            <div className="pt-1">
              <p className="mb-0.5 text-xs text-muted-foreground">Resolution notes</p>
              <p className="text-foreground">{request.resolution_notes}</p>
            </div>
          )}
          {request.resolution_legal_basis && (
            <div className="pt-1">
              <p className="mb-0.5 text-xs text-muted-foreground">Legal basis</p>
              <p className="text-foreground">{request.resolution_legal_basis}</p>
            </div>
          )}
        </div>
      </DetailCard>

      {request.status === "rejected" && (
        <DetailCard title="Your right to escalate">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              If you believe this rejection is incorrect, you may complain to the Information Regulator
              of South Africa at{" "}
              <span className="font-mono">complaints.IR@justice.gov.za</span>
              {" "}or{" "}
              <a
                href="https://www.justice.gov.za/inforeg/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                www.justice.gov.za/inforeg <ExternalLink className="size-3" />
              </a>
            </p>
          </div>
        </DetailCard>
      )}
    </DetailPageLayout>
  )
}
