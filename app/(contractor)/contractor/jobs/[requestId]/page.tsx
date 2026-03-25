import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatZAR } from "@/lib/constants"
import { JobStatusActions } from "./JobStatusActions"

export default async function ContractorJobDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: job } = await supabase
    .from("maintenance_requests")
    .select(`
      id, title, description, status, urgency, category,
      work_order_number, created_at, scheduled_date, scheduled_time_from,
      access_instructions, special_instructions,
      estimated_cost_cents, quoted_cost_cents, actual_cost_cents,
      properties(name, address_line1, city),
      units(unit_number),
      tenants(first_name, last_name, phone)
    `)
    .eq("id", requestId)
    .single()

  if (!job) redirect("/contractor/jobs")

  const prop = job.properties as unknown as { name: string; address_line1: string; city: string } | null
  const unit = job.units as unknown as { unit_number: string } | null
  const tenant = job.tenants as unknown as { first_name: string; last_name: string; phone: string } | null

  // Get quotes for this job
  const { data: quotes } = await supabase
    .from("maintenance_quotes")
    .select("id, status, total_incl_vat_cents, submitted_at, rejection_reason")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })

  // Get photos
  const { data: photos } = await supabase
    .from("maintenance_photos")
    .select("id, storage_path, caption, photo_phase")
    .eq("request_id", requestId)
    .order("created_at")

  const tenantPhotos = (photos ?? []).filter((p) => p.photo_phase === "before")
  const latestQuote = (quotes ?? [])[0]

  const urgencyColors: Record<string, string> = {
    emergency: "bg-red-100 text-red-700",
    urgent: "bg-amber-100 text-amber-700",
    routine: "bg-blue-100 text-blue-700",
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contractor/jobs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          &larr; Back to jobs
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="font-heading text-xl flex-1">{job.title}</h1>
          <Badge className={urgencyColors[job.urgency ?? "routine"] ?? ""} variant="secondary">
            {job.urgency ?? "routine"}
          </Badge>
        </div>
        {job.work_order_number && (
          <p className="text-xs font-mono text-muted-foreground mt-1">{job.work_order_number}</p>
        )}
      </div>

      {/* Property & contact */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Property</p>
            <p className="text-sm font-medium">{unit?.unit_number}, {prop?.name ?? prop?.address_line1}, {prop?.city}</p>
          </div>
          {tenant && (
            <div>
              <p className="text-xs text-muted-foreground">Tenant</p>
              <p className="text-sm">{tenant.first_name} {tenant.last_name} — {tenant.phone}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job description */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Job Description</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{job.description}</p>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span>Category: {job.category}</span>
            {job.estimated_cost_cents && <span>Estimate: {formatZAR(job.estimated_cost_cents)}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Tenant photos */}
      {tenantPhotos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Photos from tenant</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {tenantPhotos.map((p) => (
                <div key={p.id} className="aspect-square rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  Photo
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Access instructions */}
      {(job.access_instructions || job.special_instructions) && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Instructions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {job.access_instructions && (
              <div>
                <p className="text-xs text-muted-foreground">Access</p>
                <p className="text-sm">{job.access_instructions}</p>
              </div>
            )}
            {job.special_instructions && (
              <div>
                <p className="text-xs text-muted-foreground">Special instructions</p>
                <p className="text-sm">{job.special_instructions}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quote status */}
      {latestQuote && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Quote</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{formatZAR(latestQuote.total_incl_vat_cents)}</p>
                <p className="text-xs text-muted-foreground capitalize">{latestQuote.status}</p>
              </div>
              {latestQuote.status === "rejected" && latestQuote.rejection_reason && (
                <p className="text-xs text-red-600">Reason: {latestQuote.rejection_reason}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <JobStatusActions
        requestId={requestId}
        status={job.status}
      />
    </div>
  )
}
