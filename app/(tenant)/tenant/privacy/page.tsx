/**
 * app/(tenant)/tenant/privacy/page.tsx — Tenant POPIA privacy dashboard
 *
 * Route:  /tenant/privacy
 * Auth:   Tenant portal session + Supabase auth.getUser() for viewer-centric query
 * Data:   listControllersForSubject (cross-org), data_subject_requests
 * Notes:  D-POPIA-15: viewer-centric — queries all controller relationships by user_id.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { listControllersForSubject } from "@/lib/popia/requests"
import { SovereignDataBadge } from "@/components/popia/SovereignDataBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ExternalLink } from "lucide-react"

export default async function TenantPrivacyPage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [controllers, requestsResult] = await Promise.all([
    listControllersForSubject(user.id),
    (async () => {
      const db = createServiceClient()
      return (await db)
        .from("data_subject_requests")
        .select("id, request_type, status, submitted_at, sla_deadline, org_id")
        .eq("subject_user_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(5)
    })(),
  ])

  const recentRequests = requestsResult.data ?? []

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Your data &amp; privacy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your POPIA rights are held by you as a person. You see every controller that holds data
          about you, regardless of which workspace you&apos;re signed into.
        </p>
      </div>

      <div className="space-y-3">
        {controllers.map((ctrl) => (
          <Card key={`${ctrl.type}-${ctrl.org_id ?? "pleks"}`} className="w-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">{ctrl.org_name}</CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">
                    {ctrl.type === "pleks_rp"
                      ? "Pleks — Responsible Party for your account"
                      : `${ctrl.subject_role} — agency data`}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {ctrl.subject_role.replace("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-xs text-muted-foreground mb-3">
                {ctrl.data_categories.join(" · ")}
              </p>
              {ctrl.org_id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  render={<Link href={`/tenant/privacy/requests/new?org=${ctrl.org_id}`} />}
                >
                  Open request <ChevronRight className="size-3 ml-1" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <SovereignDataBadge variant="subject" agencyName={session.lease ? "your agency" : "agencies"} />

      {recentRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Previous requests</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                render={<Link href="/tenant/privacy/requests" />}
              >
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="divide-y">
            {recentRequests.map((r) => (
              <Link
                key={r.id}
                href={`/tenant/privacy/requests/${r.id}`}
                className="flex items-center justify-between py-2 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
              >
                <div>
                  <p className="text-sm capitalize">{r.request_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.submitted_at).toLocaleDateString("en-ZA")} · SLA{" "}
                    {new Date(r.sla_deadline).toLocaleDateString("en-ZA")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">{r.status}</Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/tenant/privacy/consent-history" />}
        >
          Consent history
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/tenant/privacy/retention" />}
        >
          Data retention
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        If you do not receive a response within 30 days of submitting a request, you may complain to
        the{" "}
        <a
          href="https://www.justice.gov.za/inforeg/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline inline-flex items-center gap-0.5"
        >
          Information Regulator <ExternalLink className="size-3" />
        </a>{" "}
        at complaints.IR@justice.gov.za · +27 10 023 5207.
      </p>
    </div>
  )
}
