/**
 * app/(dashboard)/settings/privacy/data-subject-requests/[id]/page.tsx — DSR detail + approval controls
 *
 * Route:  /settings/privacy/data-subject-requests/:id
 * Auth:   gatewaySSR() — org member; request must belong to org
 * Data:   data_subject_requests (SELECT *); previewErasure for destructive previews
 * Notes:  D-POPIA-10: MFA-fresh for approve. D-POPIA-04: status state machine.
 *         Approval executes action inline — handled via separate POST routes.
 */
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ActionButton } from "@/components/ui/actions"
import { ChevronLeft, AlertTriangle, Clock, CheckCircle2, XCircle } from "lucide-react"
import type { DataSubjectRequest } from "@/lib/popia/requests"

const STATUS_LABELS: Record<string, string> = {
  new: "New — awaiting review",
  verifying_identity: "Verifying identity",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  new: "secondary",
  verifying_identity: "secondary",
  under_review: "secondary",
  approved: "default",
  rejected: "destructive",
  completed: "default",
  cancelled: "outline",
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
  access: "The subject is requesting a copy of all data held about them.",
  correction: "The subject claims a data inaccuracy and requests correction.",
  erasure: "The subject requests deletion of specific data (subject to legal retention).",
  objection: "The subject objects to a specific processing purpose.",
  restriction: "The subject requests processing be paused without deletion.",
  portability: "The subject requests a machine-readable export of data they provided.",
  consent_withdrawal: "The subject is withdrawing a previously given consent.",
  nuke: "Full erasure request — delete everything legally permitted. Carve-outs acknowledged.",
}

export const metadata = { title: "Data subject request" }

export default async function DataSubjectRequestDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params

  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { orgId } = gw

  const db = createServiceClient()
  const { data: request, error } = await (await db)
    .from("data_subject_requests")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (error || !request) notFound()

  const r = request as DataSubjectRequest
  const now = new Date()
  const sla = new Date(r.sla_deadline)
  const isOverdue = sla < now && !["completed", "rejected", "cancelled"].includes(r.status)
  const daysLeft = Math.ceil((sla.getTime() - now.getTime()) / 86400000)
  const isDestructive = r.request_type === "erasure" || r.request_type === "nuke"
  const isOpen = !["completed", "rejected", "cancelled"].includes(r.status)

  const carveouts = (r.request_scope as { acknowledged_carveouts?: { category: string; reason: string }[] })
    ?.acknowledged_carveouts ?? []

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <ActionButton asChild tone="secondary" className="size-8">
          <Link href="/settings/privacy/data-subject-requests">
            <ChevronLeft className="size-4" />
          </Link>
        </ActionButton>
        <div>
          <h1 className="text-lg font-semibold capitalize">
            {r.request_type.replaceAll("_", " ")} request
          </h1>
          <p className="text-xs text-muted-foreground">
            Submitted {new Date(r.submitted_at).toLocaleDateString("en-ZA")}
          </p>
        </div>
      </div>

      {/* Subject info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Subject</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {r.subject_full_name && <p className="font-medium">{r.subject_full_name}</p>}
          <p className="text-muted-foreground">{r.subject_email}</p>
          {r.subject_role_context && (
            <p className="text-xs text-muted-foreground capitalize">{r.subject_role_context}</p>
          )}
        </CardContent>
      </Card>

      {/* Status & SLA */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Status</CardTitle>
            <Badge variant={STATUS_VARIANTS[r.status] ?? "outline"}>
              {STATUS_LABELS[r.status] ?? r.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">SLA deadline</span>
            <span className={isOverdue ? "text-destructive font-medium flex items-center gap-1" : ""}>
              {isOverdue && <AlertTriangle className="size-3" />}
              {sla.toLocaleDateString("en-ZA")}
              {isOverdue && " — overdue"}
              {!isOverdue && isOpen && ` (${daysLeft}d remaining)`}
            </span>
          </div>
          {r.subject_narrative && (
            <div>
              <p className="text-muted-foreground text-xs mb-1">Subject narrative</p>
              <p className="text-sm">{r.subject_narrative}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request type description */}
      <div className="text-sm text-muted-foreground p-3 rounded-md border bg-muted/30">
        <p className="font-medium text-foreground mb-1 capitalize">
          {r.request_type.replaceAll("_", " ")} — what this means
        </p>
        <p>{TYPE_DESCRIPTIONS[r.request_type] ?? "Custom request type."}</p>
      </div>

      {/* Nuke carveout acknowledgements */}
      {r.request_type === "nuke" && carveouts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Acknowledged carve-outs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {carveouts.map((c) => (
              <div key={c.category} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="capitalize">
                  {c.category.replaceAll("_", " ")} — <span className="text-muted-foreground">{c.reason}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Resolution details */}
      {(r.resolution_notes || r.resolution_legal_basis) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resolution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.resolution_notes && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Notes</p>
                <p>{r.resolution_notes}</p>
              </div>
            )}
            {r.resolution_legal_basis && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Legal basis for decision</p>
                <p>{r.resolution_legal_basis}</p>
              </div>
            )}
            {r.resolved_at && (
              <p className="text-xs text-muted-foreground">
                Resolved {new Date(r.resolved_at).toLocaleDateString("en-ZA")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {isOpen && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {isDestructive
              ? "Approving an erasure or nuke request requires MFA re-authentication. The action executes immediately on approval."
              : "Review the request and approve or reject. The subject is notified by email."}
          </p>
          <div className="flex gap-3">
            <ActionButton asChild tone="primary" className="flex-1">
              <Link href={`/api/popia/request/${r.id}/approve`}>
                <CheckCircle2 className="size-4 mr-2" />
                {r.request_type === "access" || r.request_type === "portability"
                  ? "Generate export"
                  : "Approve request"}
              </Link>
            </ActionButton>
            <ActionButton asChild tone="secondary">
              <Link href={`/settings/privacy/data-subject-requests/${r.id}/reject`}>
                <XCircle className="size-4 mr-2" />
                Reject
              </Link>
            </ActionButton>
          </div>

          {isDestructive && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="size-3" />
              Destructive — this action cannot be undone. MFA re-authentication required.
            </p>
          )}
        </div>
      )}

      {!isOpen && r.status !== "cancelled" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-md">
          <Clock className="size-4 shrink-0" />
          <span>
            This request has been {r.status}.{" "}
            {r.status === "rejected" && (
              <>
                The subject was notified and may escalate to the Information Regulator at{" "}
                <span className="font-mono">complaints.IR@justice.gov.za</span>.
              </>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
