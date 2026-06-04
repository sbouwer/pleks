/**
 * app/(landlord)/landlord/privacy/page.tsx — Landlord POPIA privacy dashboard
 *
 * Route:  /landlord/privacy
 * Auth:   Landlord portal session + Supabase auth.getUser() for viewer-centric query
 * Data:   listControllersForSubject (cross-org), data_subject_requests
 * Notes:  D-POPIA-15: viewer-centric. Cross-links to /landlord/trust-summary (BUILD_64)
 *         for the 5-year PPRA retention window on trust records.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { listControllersForSubject } from "@/lib/popia/requests"
import { SovereignDataBadge } from "@/components/popia/SovereignDataBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ExternalLink } from "lucide-react"

export default async function LandlordPrivacyPage() {
  const session = await getLandlordSession()
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
        .select("id, request_type, status, submitted_at, sla_deadline")
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
          Your POPIA rights are held by you as a person, across all agencies that hold data about you.
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
                <div className="flex gap-2">
                  <ActionButton asChild tone="secondary" size="sm" className="h-7 text-xs">
                    <Link href={`/landlord/privacy/requests/new?org=${ctrl.org_id}`}>
                      Open request <ChevronRight className="size-3 ml-1" />
                    </Link>
                  </ActionButton>
                  {ctrl.subject_role === "landlord" && (
                    <ActionButton asChild tone="secondary" size="sm" className="h-7 text-xs">
                      <Link href="/landlord/trust-summary">
                        Trust summary
                      </Link>
                    </ActionButton>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <SovereignDataBadge variant="subject" agencyName="your agency" />

      {recentRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Previous requests</CardTitle>
              <ActionButton asChild tone="secondary" size="sm" className="h-7 text-xs">
                <Link href="/landlord/privacy/requests">
                  View all
                </Link>
              </ActionButton>
            </div>
          </CardHeader>
          <CardContent className="divide-y">
            {recentRequests.map((r) => (
              <Link
                key={r.id}
                href={`/landlord/privacy/requests/${r.id}`}
                className="flex items-center justify-between py-2 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
              >
                <div>
                  <p className="text-sm capitalize">{r.request_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.submitted_at).toLocaleDateString("en-ZA")}
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
        <ActionButton asChild tone="secondary" size="sm">
          <Link href="/landlord/privacy/consent-history">
            Consent history
          </Link>
        </ActionButton>
        <ActionButton asChild tone="secondary" size="sm">
          <Link href="/landlord/privacy/retention">
            Data retention
          </Link>
        </ActionButton>
      </div>

      <p className="text-xs text-muted-foreground">
        If you do not receive a response within 30 days, you may complain to the{" "}
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
