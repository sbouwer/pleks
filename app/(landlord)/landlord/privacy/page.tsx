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
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { ActionButton } from "@/components/ui/actions"
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
    <div className="space-y-6">
      <ResourcePageHeader
        eyebrow="Landlord"
        title="Your data & privacy"
        headline="Your POPIA rights, held by you"
        sub="Across all agencies that hold data about you, regardless of which workspace you're signed into."
      />

      <div className="space-y-3">
        {controllers.map((ctrl) => (
          <DetailCard
            key={`${ctrl.type}-${ctrl.org_id ?? "pleks"}`}
            title={ctrl.org_name}
            headerAction={
              <span className="rounded-[var(--r-button)] border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground">
                {ctrl.subject_role.replace("_", " ")}
              </span>
            }
          >
            <p className="mb-1 text-xs capitalize text-muted-foreground">
              {ctrl.type === "pleks_rp"
                ? "Pleks — Responsible Party for your account"
                : `${ctrl.subject_role} — agency data`}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">{ctrl.data_categories.join(" · ")}</p>
            {ctrl.org_id && (
              <div className="flex gap-2">
                <ActionButton asChild tone="secondary" size="sm">
                  <Link href={`/landlord/privacy/requests/new?org=${ctrl.org_id}`}>
                    Open request <ChevronRight className="ml-1 size-3" />
                  </Link>
                </ActionButton>
                {ctrl.subject_role === "landlord" && (
                  <ActionButton asChild tone="secondary" size="sm">
                    <Link href="/landlord/trust-summary">
                      Trust summary
                    </Link>
                  </ActionButton>
                )}
              </div>
            )}
          </DetailCard>
        ))}
      </div>

      <SovereignDataBadge variant="subject" agencyName="your agency" />

      {recentRequests.length > 0 && (
        <DetailCard title="Previous requests" action={{ label: "View all", href: "/landlord/privacy/requests" }} flush>
          <div className="divide-y divide-border">
            {recentRequests.map((r) => (
              <Link
                key={r.id}
                href={`/landlord/privacy/requests/${r.id}`}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm capitalize text-foreground">{r.request_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.submitted_at).toLocaleDateString("en-ZA")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-[var(--r-button)] border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">{r.status}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </DetailCard>
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
