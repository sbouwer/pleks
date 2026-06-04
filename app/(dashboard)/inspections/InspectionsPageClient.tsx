"use client"

/**
 * app/(dashboard)/inspections/InspectionsPageClient.tsx — Client-side inspections list with React Query
 *
 * Route:  /inspections
 * Auth:   gateway (dashboard layout)
 * Data:   fetchInspectionsAction via React Query
 */
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { ListToolbar, ToolbarFilter } from "@/components/ui/resource-list"
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

// Canonical inspections.status values (003_properties.sql CHECK constraint), with
// human-readable labels for the Status filter.
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "awaiting_tenant_review", label: "Awaiting tenant review" },
  { value: "disputed", label: "Disputed" },
  { value: "dispute_resolved", label: "Dispute resolved" },
  { value: "finalised", label: "Finalised" },
]

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

  const [search, setSearch] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])

  const filtered = list.filter((insp) => {
    const unit = insp.units as unknown as { unit_number: string; properties: { name: string } } | null
    const haystack = [
      insp.inspection_type?.replaceAll("_", " "),
      unit?.unit_number,
      unit?.properties?.name,
    ].filter(Boolean).join(" ").toLowerCase()
    const matchSearch = !search || haystack.includes(search.toLowerCase())
    const matchStatus = statuses.length === 0 || statuses.includes(insp.status)
    return matchSearch && matchStatus
  })

  const statusWord = statuses.length === 1 ? "status" : "statuses"
  const statusNote = statuses.length > 0 ? ` · ${statuses.length} ${statusWord}` : ""
  const countLabel = `${filtered.length} of ${list.length} inspection${list.length === 1 ? "" : "s"}${statusNote}`

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Operations"
        title="Inspections"
        headline="Property inspections"
        sub={
          dataUpdatedAt > 0 ? (
            <span className="flex items-center gap-2 text-xs">
              Updated {relativeTime(new Date(dataUpdatedAt))}
              <button type="button" className="pa-link" onClick={() => queryClient.invalidateQueries({ queryKey })}>Refresh</button>
            </span>
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
        <div className="space-y-4">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by type, property or unit…"
            filters={
              <ToolbarFilter
                label="Status"
                multiple
                selected={statuses}
                onChange={setStatuses}
                options={STATUS_OPTIONS}
              />
            }
          />

          <p className="text-xs text-muted-foreground">{countLabel}</p>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No inspections match your search.</p>
          ) : (
          <div className="space-y-2">
          {filtered.map((insp) => {
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
      )}
    </div>
  )
}
