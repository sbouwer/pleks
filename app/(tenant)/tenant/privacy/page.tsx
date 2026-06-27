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
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { ActionButton } from "@/components/ui/actions"
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
    <div className="space-y-6">
      <ResourcePageHeader
        eyebrow="Tenant"
        title="Your data & privacy"
        headline="Your POPIA rights, held by you"
        sub="You see every controller that holds data about you, regardless of which workspace you're signed into."
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
              <ActionButton asChild tone="secondary" size="sm">
                <Link href={`/tenant/privacy/requests/new?org=${ctrl.org_id}`}>
                  Open request <ChevronRight className="ml-1 size-3" />
                </Link>
              </ActionButton>
            )}
          </DetailCard>
        ))}
      </div>

      <SovereignDataBadge variant="subject" agencyName={session.lease ? "your agency" : "agencies"} />

      {recentRequests.length > 0 && (
        <DetailCard title="Previous requests" action={{ label: "View all", href: "/tenant/privacy/requests" }} flush>
          <div className="divide-y divide-border">
            {recentRequests.map((r) => (
              <Link
                key={r.id}
                href={`/tenant/privacy/requests/${r.id}`}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm capitalize text-foreground">{r.request_type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.submitted_at).toLocaleDateString("en-ZA")} · SLA{" "}
                    {new Date(r.sla_deadline).toLocaleDateString("en-ZA")}
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
