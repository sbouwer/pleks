/**
 * app/(dashboard)/settings/privacy/my-data/page.tsx — Agent's own Pleks-RP data (subject-centric)
 *
 * Route:  /settings/privacy/my-data
 * Auth:   gatewaySSR() — logged-in org member; uses auth.getUser() for subject-centric query
 * Data:   listControllersForSubject (all controllers for the agent as a natural person)
 * Notes:  D-POPIA-15: agent's personal POPIA rights, not their org's data. Same viewer-centric
 *         pattern as /tenant/privacy — agent sees all controllers they have relationships with.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createClient } from "@/lib/supabase/server"
import { listControllersForSubject } from "@/lib/popia/requests"
import { SovereignDataBadge } from "@/components/popia/SovereignDataBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ExternalLink } from "lucide-react"

export const metadata = { title: "My data & privacy" }

export default async function MyDataPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const controllers = await listControllersForSubject(user.id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl mb-1">My data &amp; privacy</h1>
        <p className="text-sm text-muted-foreground">
          Your POPIA rights are held by you as a person — not by this workspace. You see every
          controller that holds data about you, across all your Pleks relationships.
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
                  {ctrl.subject_role.replaceAll("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-xs text-muted-foreground mb-3">
                {ctrl.data_categories.join(" · ")}
              </p>
              {ctrl.org_id && (
                <ActionButton asChild tone="secondary" size="sm" className="h-7 text-xs">
                  <Link href={`/tenant/privacy/requests/new?org=${ctrl.org_id}`}>
                    Open request <ChevronRight className="size-3 ml-1" />
                  </Link>
                </ActionButton>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <SovereignDataBadge variant="subject" agencyName="agencies" />

      <div className="grid grid-cols-2 gap-3">
        <ActionButton asChild tone="secondary" size="sm">
          <Link href="/tenant/privacy/consent-history">
            Consent history
          </Link>
        </ActionButton>
        <ActionButton asChild tone="secondary" size="sm">
          <Link href="/tenant/privacy/retention">
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
