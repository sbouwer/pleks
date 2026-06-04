/**
 * app/(supplier)/supplier/jobs/page.tsx — Supplier jobs list (all assigned maintenance requests)
 *
 * Route:  /supplier/jobs
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   maintenance_requests via service, scoped to session.contractorId
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function ContractorJobsPage() {
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  const service = await createServiceClient()

  const { data: jobs, error: jobsError } = await service
    .from("maintenance_requests")
    .select(`
      id, title, status, urgency, category, created_at,
      work_order_number, scheduled_date,
      properties(name, address_line1),
      units(unit_number)
    `)
    .eq("contractor_id", session.contractorId)
    .not("status", "in", '("cancelled")')
    .order("created_at", { ascending: false })
    logQueryError("ContractorJobsPage maintenance_requests", jobsError)

  const allJobs = jobs ?? []

  const statusLabels: Record<string, string> = {
    pending_quote: "Quote requested",
    quote_submitted: "Quote submitted",
    quote_approved: "Quote approved",
    quote_rejected: "Quote rejected",
    work_order_sent: "New â€” acknowledge",
    acknowledged: "Acknowledged",
    in_progress: "In progress",
    pending_completion: "Completion pending",
    completed: "Completed",
    closed: "Closed",
  }

  const statusColors: Record<string, string> = {
    pending_quote: "bg-red-100 text-red-700",
    quote_submitted: "bg-blue-100 text-blue-700",
    quote_approved: "bg-emerald-100 text-emerald-700",
    quote_rejected: "bg-red-100 text-red-700",
    work_order_sent: "bg-amber-100 text-amber-700",
    acknowledged: "bg-blue-100 text-blue-700",
    in_progress: "bg-blue-100 text-blue-700",
    pending_completion: "bg-yellow-100 text-yellow-700",
    completed: "bg-emerald-100 text-emerald-700",
    closed: "bg-gray-100 text-gray-700",
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Jobs</h1>

      {allJobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">No jobs assigned to you yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allJobs.map((job) => {
            const prop = job.properties as unknown as { name: string; address_line1: string } | null
            const unit = job.units as unknown as { unit_number: string } | null
            return (
              <Card key={job.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={statusColors[job.status] ?? "bg-gray-100 text-gray-700"} variant="secondary">
                          {statusLabels[job.status] ?? job.status}
                        </Badge>
                        {job.work_order_number && (
                          <span className="text-xs font-mono text-muted-foreground">{job.work_order_number}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{job.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {unit?.unit_number}, {prop?.name ?? prop?.address_line1}
                      </p>
                      {job.scheduled_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Scheduled: {new Date(job.scheduled_date).toLocaleDateString("en-ZA")}
                        </p>
                      )}
                    </div>
                    <ActionButton asChild tone="secondary" size="sm">
                      <Link href={`/supplier/jobs/${job.id}`}>
                        View
                      </Link>
                    </ActionButton>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

