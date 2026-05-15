/**
 * app/(tenant)/tenant/privacy/requests/[id]/page.tsx — Request detail view (subject-side)
 *
 * Route:  /tenant/privacy/requests/:id
 * Auth:   Tenant portal session + subject ownership check
 * Data:   data_subject_requests (SELECT), popia_exports (SELECT for download link)
 */
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ExternalLink } from "lucide-react"

const STATUS_LABELS: Record<string, string> = {
  new: "Received",
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

export default async function RequestDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const db = createServiceClient()
  const { data: request } = await (await db)
    .from("data_subject_requests")
    .select("*")
    .eq("id", id)
    .single()

  if (!request) notFound()

  // Subject must own this request
  const isOwner =
    request.subject_user_id === user.id ||
    request.subject_email?.toLowerCase() === user.email?.toLowerCase()

  if (!isOwner) notFound()

  const sla = new Date(request.sla_deadline)
  const isOverdue = sla < new Date() && !["completed", "rejected", "cancelled"].includes(request.status)

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          render={<Link href="/tenant/privacy/requests" />}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold capitalize">
            {request.request_type.replaceAll("_", " ")} request
          </h1>
          <p className="text-xs text-muted-foreground">
            Submitted {new Date(request.submitted_at).toLocaleDateString("en-ZA")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Status</CardTitle>
            <Badge variant={STATUS_VARIANTS[request.status] ?? "outline"}>
              {STATUS_LABELS[request.status] ?? request.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">SLA deadline</span>
            <span className={isOverdue ? "text-destructive font-medium" : ""}>
              {sla.toLocaleDateString("en-ZA")}
              {isOverdue && " — overdue"}
            </span>
          </div>
          {request.resolution_notes && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Resolution notes</p>
              <p>{request.resolution_notes}</p>
            </div>
          )}
          {request.resolution_legal_basis && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Legal basis</p>
              <p>{request.resolution_legal_basis}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {request.export_id && (
        <Button
          className="w-full"
          render={<Link href={`/api/popia/request/${request.id}/download`} />}
        >
          Download your data export <ExternalLink className="size-4 ml-2" />
        </Button>
      )}

      {request.status === "rejected" && (
        <div className="text-xs text-muted-foreground space-y-1 p-3 border rounded-md">
          <p className="font-medium">Your right to escalate</p>
          <p>
            If you believe this rejection is incorrect, you may complain to the Information Regulator
            of South Africa at{" "}
            <span className="font-mono">complaints.IR@justice.gov.za</span>
            {" "}or{" "}
            <a
              href="https://www.justice.gov.za/inforeg/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              www.justice.gov.za/inforeg <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
