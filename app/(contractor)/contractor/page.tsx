import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default async function ContractorDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Get contractor records (may work for multiple orgs)
  const { data: contractors } = await supabase
    .from("contractor_view")
    .select("id, name, company_name, org_id, organisations(name)")
    .eq("auth_user_id", user.id)
    .eq("portal_access_enabled", true)

  const contractorIds = (contractors ?? []).map((c) => c.id)

  if (contractorIds.length === 0) redirect("/login")

  const contractorName = contractors?.[0]?.company_name ?? contractors?.[0]?.name ?? "Contractor"

  // Get job counts
  const { data: jobs } = await supabase
    .from("maintenance_requests")
    .select("id, status, title, urgency, created_at, properties(name), units(unit_number)")
    .in("contractor_id", contractorIds)
    .not("status", "in", '("cancelled","closed")')
    .order("created_at", { ascending: false })

  const allJobs = jobs ?? []
  const newJobs = allJobs.filter((j) => j.status === "work_order_sent" || j.status === "pending_quote")
  const quotesPending = allJobs.filter((j) => j.status === "pending_quote")
  const inProgress = allJobs.filter((j) => ["acknowledged", "in_progress", "quote_approved"].includes(j.status))

  // Pending invoices
  const { data: pendingInvoices } = await supabase
    .from("supplier_invoices")
    .select("id")
    .in("contractor_id", contractorIds)
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
        {(contractors ?? []).length > 1 && (
          <p className="text-xs text-muted-foreground mt-1">
            Working with: {(contractors ?? []).map((c) => {
              const org = c.organisations as unknown as { name: string } | null
              return org?.name
            }).filter(Boolean).join(", ")}
          </p>
        )}
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
                    <Button size="sm" variant="outline" render={<Link href={`/contractor/jobs/${job.id}`} />}>
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
        <Button variant="outline" className="h-12" render={<Link href="/contractor/jobs" />}>
          All Jobs
        </Button>
        <Button variant="outline" className="h-12" render={<Link href="/contractor/invoices" />}>
          Invoices
        </Button>
      </div>
    </div>
  )
}
