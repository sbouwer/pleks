/**
 * app/(supplier)/supplier/jobs/page.tsx — Supplier jobs list (all assigned maintenance requests)
 *
 * Route:  /supplier/jobs
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   maintenance_requests via service, scoped to session.contractorId
 * Notes:  Canon ResourcePageHeader + ListCard rows / EmptyResourceState (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Wrench } from "lucide-react"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ListCard } from "@/components/ui/resource-list"
import { ActionButton } from "@/components/ui/actions"
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

function statusTone(s: string): string {
  if (["pending_quote", "quote_rejected"].includes(s)) return "border-destructive/30 bg-destructive/10 text-destructive"
  if (["work_order_sent", "pending_completion"].includes(s)) return "border-warning/30 bg-warning/10 text-warning"
  if (["quote_approved", "completed"].includes(s)) return "border-success/30 bg-success/10 text-success"
  if (["quote_submitted", "acknowledged", "in_progress"].includes(s)) return "border-info/30 bg-info/10 text-info"
  return "border-border bg-muted text-muted-foreground"
}

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

  if (allJobs.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Supplier"
        title="Jobs"
        headline="No jobs yet"
        headerSub="Jobs assigned to you by an agency appear here."
        emptyTitle="No jobs assigned to you yet"
        emptySub="When an agency assigns you a maintenance job, it will appear here."
        icon={<Wrench className="h-6 w-6" />}
      />
    )
  }

  return (
    <div>
      <ResourcePageHeader eyebrow="Supplier" title="Jobs" headline={`${allJobs.length} job${allJobs.length === 1 ? "" : "s"}`} />
      <ListCard>
        <div className="divide-y divide-border">
          {allJobs.map((job) => {
            const prop = job.properties as unknown as { name: string; address_line1: string } | null
            const unit = job.units as unknown as { unit_number: string } | null
            return (
              <div key={job.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-[var(--r-button)] border px-2 py-0.5 text-xs ${statusTone(job.status)}`}>
                      {STATUS_LABELS[job.status] ?? job.status}
                    </span>
                    {job.work_order_number && (
                      <span className="font-mono text-xs text-muted-foreground">{job.work_order_number}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">{job.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {unit?.unit_number}, {prop?.name ?? prop?.address_line1}
                  </p>
                  {job.scheduled_date && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Scheduled: {new Date(job.scheduled_date).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}
                    </p>
                  )}
                </div>
                <ActionButton asChild tone="secondary" size="sm">
                  <Link href={`/supplier/jobs/${job.id}`}>View</Link>
                </ActionButton>
              </div>
            )
          })}
        </div>
      </ListCard>
    </div>
  )
}
