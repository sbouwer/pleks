/**
 * app/(dashboard)/settings/privacy/data-subject-requests/page.tsx — Agency POPIA request inbox
 *
 * Route:  /settings/privacy/data-subject-requests
 * Auth:   gatewaySSR() — org member (agent workspace)
 * Data:   data_subject_requests filtered by org_id; getRequestStats for summary row
 * Notes:  D-POPIA-16: agency-centric view — sees only own org's requests.
 *         D-POPIA-04: 30-day SLA countdown; overdue highlighted in destructive.
 */
import type React from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestStats } from "@/lib/popia/requests"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ActionButton } from "@/components/ui/actions"
import { ChevronRight, Clock, AlertTriangle } from "lucide-react"
import type { DataSubjectRequest } from "@/lib/popia/requests"
import { SA_TIMEZONE } from "@/lib/dates"

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  verifying_identity: "Verifying ID",
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

export const metadata = { title: "Data subject requests" }

export default async function DataSubjectRequestsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ status?: string; type?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { orgId } = gw

  const { status: filterStatus, type: filterType } = await searchParams

  const db = createServiceClient()
  let query = (await db)
    .from("data_subject_requests")
    .select("id, subject_full_name, subject_email, request_type, status, submitted_at, sla_deadline, assigned_to")
    .eq("org_id", orgId)
    .order("submitted_at", { ascending: false })
    .limit(50)

  if (filterStatus) query = query.eq("status", filterStatus)
  if (filterType) query = query.eq("request_type", filterType)

  const { data: requests, error } = await query
  if (error) console.error("DSR list failed:", error.message)

  const allRequests = (requests ?? []) as DataSubjectRequest[]
  const now = new Date()
  const stats = await getRequestStats(orgId, 1)

  const overdue = allRequests.filter((r) => {
    const sla = new Date(r.sla_deadline)
    return sla < now && !["completed", "rejected", "cancelled"].includes(r.status)
  })

  const ACTIVE_STATUSES = new Set(["new", "verifying_identity", "under_review", "approved"])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl mb-1">Data subject requests</h1>
        <p className="text-sm text-muted-foreground">
          POPIA right-to-access, correction, erasure, and nuke requests from your tenants,
          landlords, and suppliers. 30-day SLA from submission.
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Open", value: stats.open },
          { label: "Overdue", value: overdue.length, variant: "destructive" },
          { label: "Completed this month", value: stats.completed },
          { label: "Avg resolution", value: stats.avg_resolution_days == null ? "—" : `${stats.avg_resolution_days}d` },
        ].map(({ label, value, variant }) => (
          <Card key={label} className={variant === "destructive" && overdue.length > 0 ? "border-destructive" : ""}>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-semibold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "All", href: "/settings/privacy/data-subject-requests" },
          { label: "Open", href: "?status=new" },
          { label: "Overdue", href: "?status=under_review" },
          { label: "Completed", href: "?status=completed" },
        ].map(({ label, href }) => (
          <ActionButton key={label} asChild tone="secondary" size="sm" className="h-7 text-xs">
            <Link href={href}>
              {label}
            </Link>
          </ActionButton>
        ))}
      </div>

      {/* Request list */}
      {allRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No data subject requests yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {allRequests.map((r) => {
              const sla = new Date(r.sla_deadline)
              const isActive = ACTIVE_STATUSES.has(r.status)
              const isOverdue = sla < now && isActive
              const daysLeft = Math.ceil((sla.getTime() - now.getTime()) / 86400000)

              let slaIndicator: React.ReactNode = null
              if (isOverdue) {
                slaIndicator = (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="size-3" />Overdue
                  </span>
                )
              } else if (isActive) {
                slaIndicator = (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />{daysLeft}d left
                  </span>
                )
              }

              return (
                <Link
                  key={r.id}
                  href={`/settings/privacy/data-subject-requests/${r.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {r.subject_full_name ?? r.subject_email}
                      </p>
                      <Badge variant={STATUS_VARIANTS[r.status] ?? "outline"} className="text-xs shrink-0">
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {r.request_type.replaceAll("_", " ")} ·{" "}
                      {new Date(r.submitted_at).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {slaIndicator}
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
