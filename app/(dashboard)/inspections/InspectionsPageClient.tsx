"use client"

/**
 * app/(dashboard)/inspections/InspectionsPageClient.tsx — Client-side inspections list with React Query
 *
 * Route:  /inspections
 * Auth:   gateway (dashboard layout)
 * Data:   fetchInspectionsAction via React Query
 */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ClipboardCheck } from "lucide-react"
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
  const router = useRouter()
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.inspections(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchInspectionsAction(orgId),
    staleTime: STALE_TIME.inspections,
  })

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Operations"
        title="Inspections"
        headline="Property inspections"
        sub={
          (list.length > 0 || dataUpdatedAt > 0) ? (
            <div className="space-y-0.5">
              {list.length > 0 && <p>{list.length} inspections</p>}
              {dataUpdatedAt > 0 && (
                <span className="flex items-center gap-2 text-xs">
                  Updated {relativeTime(new Date(dataUpdatedAt))}
                  <button type="button" className="pa-link" onClick={() => queryClient.invalidateQueries({ queryKey })}>Refresh</button>
                </span>
              )}
            </div>
          ) : undefined
        }
        action={<AddButton label="Schedule inspection" onClick={() => router.push("/inspections/new")} />}
      />

      {list.length === 0 ? (
        <EmptyResourceState
          emptyTitle="No inspections yet"
          emptySub="Schedule your first inspection from a unit's detail page."
          icon={<ClipboardCheck className="h-6 w-6" />}
          heroAction={<AddButton label="Schedule inspection" showPlus={false} onClick={() => router.push("/inspections/new")} />}
        />
      ) : (
        <div className="space-y-2">
          {list.map((insp) => {
            const unit = insp.units as unknown as { unit_number: string; properties: { name: string } } | null

            return (
              <Link key={insp.id} href={`/inspections/${insp.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4 pb-4">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-medium capitalize">
                        {insp.inspection_type.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          if (insp.scheduled_date) return `Scheduled: ${new Date(insp.scheduled_date as string).toLocaleDateString("en-ZA")}`
                          if (insp.conducted_date) return `Conducted: ${new Date(insp.conducted_date as string).toLocaleDateString("en-ZA")}`
                          return ""
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
