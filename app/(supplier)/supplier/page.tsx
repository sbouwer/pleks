/**
 * app/(supplier)/supplier/page.tsx — Supplier dashboard: job counts, needs-action list, invoice summary
 *
 * Route:  /supplier
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   maintenance_requests + supplier_invoices via service, scoped to session.contractorId
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"

export default async function ContractorDashboard() {
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  const service = await createServiceClient()
  const contractorName = session.displayName

  // Get job counts (scoped to this supplier)
  const { data: jobs } = await service
    .from("maintenance_requests")
    .select("id, status, title, urgency, created_at, properties(name), units(unit_number)")
    .eq("contractor_id", session.contractorId)
    .not("status", "in", '("cancelled","closed")')
    .order("created_at", { ascending: false })

  const allJobs = jobs ?? []
  const newJobs = allJobs.filter((j) => j.status === "work_order_sent" || j.status === "pending_quote")
  const quotesPending = allJobs.filter((j) => j.status === "pending_quote")
  const inProgress = allJobs.filter((j) => ["acknowledged", "in_progress", "quote_approved"].includes(j.status))

  // Pending invoices
  const { data: pendingInvoices } = await service
    .from("supplier_invoices")
    .select("id")
    .eq("contractor_id", session.contractorId)
    .eq("status", "pending")

  const urgencyColors: Record<string, string> = {
    emergency: "bg-red-100 text-red-700",
    urgent: "bg-amber-100 text-amber-700",
    routine: "bg-blue-100 text-blue-700",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Welcome back, {contractorName}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">New jobs</p>
            <p className="font-heading text-xl">{newJobs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Quotes pending</p>
            <p className="font-heading text-xl">{quotesPending.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">In progress</p>
            <p className="font-heading text-xl">{inProgress.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Invoices due</p>
            <p className="font-heading text-xl">{pendingInvoices?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Needs action */}
      {newJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Needs Action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {newJobs.slice(0, 5).map((job) => {
              const prop = job.properties as unknown as { name: string } | null
              const unit = job.units as unknown as { unit_number: string } | null
              return (
                <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {unit?.unit_number}, {prop?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={urgencyColors[job.urgency ?? "routine"] ?? ""} variant="secondary">
                      {job.urgency ?? "routine"}
                    </Badge>
                    <Button size="sm" variant="outline" render={<Link href={`/supplier/jobs/${job.id}`} />}>
                      View
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12" render={<Link href="/supplier/jobs" />}>
          All Jobs
        </Button>
        <Button variant="outline" className="h-12" render={<Link href="/supplier/invoices" />}>
          Invoices
        </Button>
      </div>
    </div>
  )
}

