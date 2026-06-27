/**
 * app/(supplier)/supplier/page.tsx — Supplier dashboard: job counts, needs-action list, invoice summary
 *
 * Route:  /supplier
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   maintenance_requests + supplier_invoices via service, scoped to session.contractorId
 * Notes:  Canon ResourcePageHeader + DetailCard (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { ActionButton } from "@/components/ui/actions"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"
import { logQueryError } from "@/lib/supabase/logQueryError"

function urgencyTone(u: string): string {
  if (u === "emergency") return "border-destructive/30 bg-destructive/10 text-destructive"
  if (u === "urgent") return "border-warning/30 bg-warning/10 text-warning"
  return "border-info/30 bg-info/10 text-info"
}

export default async function ContractorDashboard() {
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  const service = await createServiceClient()
  const contractorName = session.displayName

  // Get job counts (scoped to this supplier)
  const { data: jobs, error: jobsError } = await service
    .from("maintenance_requests")
    .select("id, status, title, urgency, created_at, properties(name), units(unit_number)")
    .eq("contractor_id", session.contractorId)
    .not("status", "in", '("cancelled","closed")')
    .order("created_at", { ascending: false })
    logQueryError("ContractorDashboard maintenance_requests", jobsError)

  const allJobs = jobs ?? []
  const newJobs = allJobs.filter((j) => j.status === "work_order_sent" || j.status === "pending_quote")
  const quotesPending = allJobs.filter((j) => j.status === "pending_quote")
  const inProgress = allJobs.filter((j) => ["acknowledged", "in_progress", "quote_approved"].includes(j.status))

  // Pending invoices
  const { data: pendingInvoices, error: pendingInvoicesError } = await service
    .from("supplier_invoices")
    .select("id")
    .eq("contractor_id", session.contractorId)
    .eq("status", "pending")
    logQueryError("ContractorDashboard supplier_invoices", pendingInvoicesError)

  const stats = [
    { label: "New jobs", value: newJobs.length },
    { label: "Quotes pending", value: quotesPending.length },
    { label: "In progress", value: inProgress.length },
    { label: "Invoices due", value: pendingInvoices?.length ?? 0 },
  ]

  return (
    <div className="space-y-4">
      <ResourcePageHeader eyebrow="Supplier" title={`Welcome back, ${contractorName}`} headline="Your jobs at a glance" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="font-heading text-xl text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Needs action */}
      {newJobs.length > 0 && (
        <DetailCard title="Needs action">
          <div className="space-y-3">
            {newJobs.slice(0, 5).map((job) => {
              const prop = job.properties as unknown as { name: string } | null
              const unit = job.units as unknown as { unit_number: string } | null
              return (
                <div key={job.id} className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{unit?.unit_number}, {prop?.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-[var(--r-button)] border px-2 py-0.5 text-xs capitalize ${urgencyTone(job.urgency ?? "routine")}`}>
                      {job.urgency ?? "routine"}
                    </span>
                    <ActionButton asChild tone="secondary" size="sm">
                      <Link href={`/supplier/jobs/${job.id}`}>View</Link>
                    </ActionButton>
                  </div>
                </div>
              )
            })}
          </div>
        </DetailCard>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <ActionButton asChild tone="secondary" className="h-12">
          <Link href="/supplier/jobs">All jobs</Link>
        </ActionButton>
        <ActionButton asChild tone="secondary" className="h-12">
          <Link href="/supplier/invoices">Invoices</Link>
        </ActionButton>
      </div>
    </div>
  )
}
