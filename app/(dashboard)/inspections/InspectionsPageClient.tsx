"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { ClipboardCheck, Plus } from "lucide-react"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchInspectionsAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"

const STATUS_MAP: Record<string, "scheduled" | "pending" | "active" | "completed" | "arrears"> = {
  scheduled: "scheduled",
  in_progress: "pending",
  completed: "completed",
  awaiting_tenant_review: "pending",
  disputed: "arrears",
  dispute_resolved: "completed",
  finalised: "completed",
}

interface Props { orgId: string }

export function InspectionsPageClient({ orgId }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.inspections(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchInspectionsAction(orgId),
    staleTime: STALE_TIME.inspections,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Inspections</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{list.length} inspections</p>
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
        <Button render={<Link href="/inspections/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Schedule Inspection
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8 text-muted-foreground" />}
          title="No inspections yet"
          description="Schedule your first inspection from a unit's detail page."
        />
      ) : (
        <div className="space-y-2">
          {list.map((insp) => {
            const unit = insp.units as unknown as { unit_number: string; properties: { name: string } } | null
            const tenant = insp.tenant_view as unknown as { first_name: string; last_name: string } | null

            return (
              <Link key={insp.id} href={`/inspections/${insp.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium capitalize">
                        {insp.inspection_type.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                        {tenant ? ` · ${tenant.first_name} ${tenant.last_name}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {insp.scheduled_date
                          ? `Scheduled: ${new Date(insp.scheduled_date).toLocaleDateString("en-ZA")}`
                          : insp.conducted_date
                            ? `Conducted: ${new Date(insp.conducted_date).toLocaleDateString("en-ZA")}`
                            : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs capitalize text-muted-foreground">{insp.lease_type}</span>
                      <StatusBadge status={STATUS_MAP[insp.status] || "scheduled"} />
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
