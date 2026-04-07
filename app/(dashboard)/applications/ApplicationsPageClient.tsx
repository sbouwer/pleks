"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Users } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchApplications } from "@/lib/queries/portfolio"
import { relativeTime } from "@/lib/utils"

const STAGE1_MAP: Record<string, "pending" | "active" | "completed" | "arrears"> = {
  pending_documents: "pending",
  documents_submitted: "pending",
  extracting: "pending",
  pre_screen_complete: "active",
  shortlisted: "completed",
  not_shortlisted: "arrears",
}

const STAGE2_MAP: Record<string, "pending" | "active" | "completed" | "arrears"> = {
  invited: "pending",
  pending_consent: "pending",
  pending_payment: "pending",
  payment_received: "active",
  screening_in_progress: "active",
  screening_complete: "completed",
  approved: "completed",
  declined: "arrears",
  withdrawn: "arrears",
}

interface Props { orgId: string }

export function ApplicationsPageClient({ orgId }: Readonly<Props>) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.applications(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchApplications(supabase as any),
    staleTime: STALE_TIME.applications,
  })

  const prescreenReady = list.filter((a) => a.stage1_status === "pre_screen_complete")
  const screeningComplete = list.filter((a) => a.stage2_status === "screening_complete")

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Applications</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {prescreenReady.length} ready to review &middot; {screeningComplete.length} screening complete
            </p>
          )}
          {dataUpdatedAt > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>Updated {relativeTime(new Date(dataUpdatedAt))}</span>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey })}
                className="text-brand hover:underline"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8 text-muted-foreground" />}
          title="No applications yet"
          description="Applications will appear when applicants apply to your listings."
        />
      ) : (
        <div className="space-y-2">
          {list.map((app) => {
            const listing = app.listings as unknown as { asking_rent_cents: number; units: { unit_number: string; properties: { name: string } } } | null
            const name = `${app.first_name || ""} ${app.last_name || ""}`.trim() || app.applicant_email

            return (
              <Link key={app.id} href={`/applications/${app.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{name}</p>
                        {app.is_foreign_national && <span className="text-xs px-1.5 py-0.5 bg-info-bg text-info rounded">Foreign</span>}
                        {app.has_co_applicant && <span className="text-xs px-1.5 py-0.5 bg-surface-elevated rounded">Joint</span>}
                        {app.applicant_motivation && <span className="text-xs">📝</span>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {listing ? `${listing.units.unit_number}, ${listing.units.properties.name}` : ""}
                        {app.gross_monthly_income_cents ? ` · Income: ${formatZAR(app.gross_monthly_income_cents)}/mo` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {app.fitscore !== null && (
                        <span className="font-heading text-lg">{app.fitscore}/100</span>
                      )}
                      {app.prescreen_score !== null && !app.fitscore && (
                        <span className="text-sm text-muted-foreground">{app.prescreen_score}/45</span>
                      )}
                      <StatusBadge status={
                        app.stage2_status
                          ? (STAGE2_MAP[app.stage2_status] || "pending")
                          : (STAGE1_MAP[app.stage1_status] || "pending")
                      } />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
