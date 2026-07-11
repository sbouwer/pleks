/**
 * app/(admin)/admin/popia-requests/page.tsx — Platform admin POPIA routing inbox
 *
 * Route:  /admin/popia-requests
 * Auth:   requireAdminAuth — platform-admin HMAC token gate
 * Data:   data_subject_requests WHERE submitted_via='platform_admin_route' OR org_id IS NULL
 * Notes:  D-POPIA-17: Pleks routes requests to the correct Responsible Party.
 *         Pleks does NOT action agency data directly — routing only.
 *         Pleks-RP requests (platform account data) are actioned here.
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { SA_TIMEZONE } from "@/lib/dates"

interface PlatformRequest {
  id: string
  subject_full_name: string | null
  subject_email: string
  request_type: string
  status: string
  submitted_at: string
  sla_deadline: string
  submitted_via: string
  org_id: string | null
  subject_narrative: string | null
}

interface OrgRow {
  id: string
  name: string
}

export default async function AdminPopiaRequestsPage() {
  await requireAdminAuth()

  const db = createServiceClient()

  const [requestsResult, orgsResult] = await Promise.all([
    (await db)
      .from("data_subject_requests")
      .select("id, subject_full_name, subject_email, request_type, status, submitted_at, sla_deadline, submitted_via, org_id, subject_narrative")
      .or("submitted_via.eq.platform_admin_route,org_id.is.null")
      .order("submitted_at", { ascending: false })
      .limit(50),
    (await db)
      .from("organisations")
      .select("id, name")
      .limit(500),
  ])

  if (requestsResult.error) console.error("admin popia-requests:", requestsResult.error.message)
  if (orgsResult.error) console.error("admin popia-requests orgs:", orgsResult.error.message)

  const requests = (requestsResult.data ?? []) as PlatformRequest[]
  const orgs = (orgsResult.data ?? []) as OrgRow[]
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]))

  const now = new Date()
  const pending = requests.filter((r) => !["completed", "rejected", "cancelled"].includes(r.status))
  const overdue = pending.filter((r) => new Date(r.sla_deadline) < now)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">POPIA routing inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Requests that reached Pleks directly instead of the agency. Route to the correct
          Responsible Party — do not action agency data directly.
        </p>
      </div>

      {/* Doctrine reminder */}
      <div className="p-3 border rounded-md bg-amber-50 border-amber-200 text-sm text-amber-900 space-y-1">
        <p className="font-medium">D-POPIA-17: Pleks is Operator, not Responsible Party (for agency data)</p>
        <p>
          Route agency-data requests to the correct agency. Only action requests for Pleks
          platform account data (org_id = null) directly.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: requests.length },
          { label: "Pending", value: pending.length },
          { label: "Overdue", value: overdue.length, danger: overdue.length > 0 },
        ].map(({ label, value, danger }) => (
          <Card key={label} className={danger ? "border-destructive" : ""}>
            <CardContent className="pt-4 pb-3">
              <p className={`text-2xl font-semibold ${danger ? "text-destructive" : ""}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No direct POPIA requests. Good — subjects are reaching their agencies correctly.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const sla = new Date(r.sla_deadline)
            const isOverdue = sla < now && !["completed", "rejected", "cancelled"].includes(r.status)
            const isPlatformAccountRequest = r.org_id === null

            return (
              <Card key={r.id} className={isOverdue ? "border-destructive" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-medium">
                        {r.subject_full_name ?? r.subject_email}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.submitted_at).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })} ·{" "}
                        <span className="capitalize">{r.request_type.replaceAll("_", " ")}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOverdue && <AlertTriangle className="size-4 text-destructive" />}
                      <Badge variant={isOverdue ? "destructive" : "secondary"} className="text-xs capitalize">
                        {r.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pb-3">
                  {r.subject_narrative && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.subject_narrative}</p>
                  )}

                  {isPlatformAccountRequest ? (
                    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1.5">
                      <span className="font-medium">Platform account request</span>
                      <span>— action directly as Pleks RP</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ArrowRight className="size-3 shrink-0" />
                      <span>
                        Route to:{" "}
                        <span className="font-medium text-foreground">
                          {r.org_id ? (orgMap.get(r.org_id) ?? r.org_id) : "unknown agency"}
                        </span>
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    SLA: {sla.toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}
                    {isOverdue && " — overdue"}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
