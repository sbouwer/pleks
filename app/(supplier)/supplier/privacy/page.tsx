/**
 * app/(supplier)/supplier/privacy/page.tsx — Supplier POPIA privacy dashboard
 *
 * Route:  /supplier/privacy
 * Auth:   Supabase auth.getUser() (same pattern as other supplier pages)
 * Data:   listControllersForSubject, data_subject_requests
 * Notes:  D-POPIA-15: viewer-centric — shows all controller relationships by user_id.
 *         Supplier dataset is the narrowest: job history, invoices, communications.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { listControllersForSubject } from "@/lib/popia/requests"
import { SovereignDataBadge } from "@/components/popia/SovereignDataBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ExternalLink } from "lucide-react"

export default async function SupplierPrivacyPage() {
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
  // Suppliers typically only have supplier-role controllers; filter to relevant
  const supplierControllers = controllers.filter(
    (c) => c.subject_role === "supplier" || c.type === "pleks_rp",
  )

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Your data &amp; privacy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exercise your POPIA rights against each organisation that holds data about you.
        </p>
      </div>

      <div className="space-y-3">
        {supplierControllers.map((ctrl) => (
          <Card key={`${ctrl.type}-${ctrl.org_id ?? "pleks"}`} className="w-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">{ctrl.org_name}</CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">
                    {ctrl.type === "pleks_rp"
                      ? "Pleks — Responsible Party for your account"
                      : "Supplier — agency data"}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">Supplier</Badge>
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
                  render={<Link href={`/supplier/privacy/requests/new?org=${ctrl.org_id}`} />}
                >
                  Open request <ChevronRight className="size-3 ml-1" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <SovereignDataBadge variant="subject" agencyName="your agency" />

      {recentRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Previous requests</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {recentRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-sm capitalize">{r.request_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.submitted_at).toLocaleDateString("en-ZA")}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs capitalize">{r.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="sm" render={<Link href="/supplier/privacy/consent-history" />}>
          Consent history
        </Button>
        <Button variant="outline" size="sm" render={<Link href="/supplier/privacy/retention" />}>
          Data retention
        </Button>
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
        at complaints.IR@justice.gov.za.
      </p>
    </div>
  )
}
