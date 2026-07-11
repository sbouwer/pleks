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
import { WarningBell } from "@/components/ui/WarningBell"
import { WarningListModal, type WarningItem } from "@/components/ui/WarningListModal"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { ListToolbar, ToolbarFilter, type ListView } from "@/components/ui/resource-list"
import { useUser } from "@/hooks/useUser"
import { useMyTeams } from "@/hooks/useMyTeams"
import { useShowScopeFilter } from "@/hooks/useShowScopeFilter"
import { isMine } from "@/lib/work/myWorkFilter"
import { isPastDate } from "@/lib/work/overdue"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ClipboardCheck, User, Users, Globe } from "lucide-react"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchInspectionsAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { SA_TIMEZONE } from "@/lib/dates"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"

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

// Inspection rows arrive with units→properties joined; this is the narrow shape we read.
type Inspection = {
  id: string
  inspection_type: string
  status: string
  lease_type: string
  scheduled_date?: string | null
  conducted_date?: string | null
  units?: unknown
}

function inspectionDateLabel(insp: Inspection): string {
  if (insp.scheduled_date) return `Scheduled: ${new Date(insp.scheduled_date).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}`
  if (insp.conducted_date) return `Conducted: ${new Date(insp.conducted_date).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}`
  return ""
}

/** Card-view tile (the "Cards" toggle) — mirrors the list row's data: type · property/unit · status · date. */
function InspectionCard({ insp, onOpen }: Readonly<{ insp: Inspection; onOpen: () => void }>) {
  const unit = insp.units as unknown as { unit_number: string; properties: { name: string } } | null
  const dateLabel = inspectionDateLabel(insp)
  return (
    <div
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium capitalize">{insp.inspection_type.replaceAll("_", " ")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatPropertyLabel(unit, { fallback: "" })}
          </p>
        </div>
        <StatusBadge status={STATUS_MAP[insp.status] || "scheduled"} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="capitalize">{insp.lease_type}</span>
        {dateLabel && <span className="truncate">{dateLabel}</span>}
      </div>
    </div>
  )
}

export function InspectionsPageClient({ orgId }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.inspections(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchInspectionsAction(orgId),
    staleTime: STALE_TIME.inspections,
  })

  const { user } = useUser()
  const { teams, teamIds } = useMyTeams()
  const showScope = useShowScopeFilter()  // View filter only from Growth up; below that, everything is "all"
  const [scope, setScope] = useState<"mine" | "all" | `team:${string}`>("mine")
  const [search, setSearch] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])
  const [view, setView] = useState<ListView>("list")
  const [showOverdue, setShowOverdue] = useState(false)

  // My work / All (ADDENDUM_TEAMS Layer 0) — flat client-side predicate; null assignee = Everyone/Org.
  const effScope = showScope ? scope : "all"
  let scopedList = list
  if (effScope === "mine" && user?.id) {
    scopedList = list.filter((insp) => isMine(insp as { assigned_user_id: string | null; assigned_team_id: string | null }, user.id, teamIds))
  } else if (effScope.startsWith("team:")) {
    const tid = effScope.slice(5)
    scopedList = list.filter((insp) => (insp as { assigned_team_id?: string | null }).assigned_team_id === tid)
  }
  const nothingAssignedToMe = list.length > 0 && effScope === "mine" && scopedList.length === 0

  const filtered = scopedList.filter((insp) => {
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
  const countLabel = `${filtered.length} of ${scopedList.length} inspection${scopedList.length === 1 ? "" : "s"}${statusNote}`

  // Overdue = still scheduled but the date has passed.
  const overdueItems: WarningItem[] = list
    .filter((insp) => {
      const sd = (insp as { scheduled_date?: string | null }).scheduled_date
      return insp.status === "scheduled" && isPastDate(sd)
    })
    .map((insp) => {
      const unit = insp.units as unknown as { unit_number: string; properties: { name: string } } | null
      const sd = (insp as { scheduled_date?: string | null }).scheduled_date
      return {
        id: insp.id,
        title: insp.inspection_type?.replaceAll("_", " ") ?? "Inspection",
        sub: [formatPropertyLabel(unit, { fallback: "" }), sd ? `due ${new Date(sd).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}` : null].filter(Boolean).join(" · "),
        href: `/inspections/${insp.id}`,
      }
    })

  return (
    <div className="flex h-full min-h-0 flex-col">
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
        action={
          <div className="flex items-center gap-2">
            <WarningBell
              count={overdueItems.length}
              label={`${overdueItems.length} overdue inspection${overdueItems.length === 1 ? "" : "s"}`}
              onClick={() => setShowOverdue(true)}
            />
            <AddButton label="Schedule inspection" onClick={() => router.push("/inspections/new")} />
          </div>
        }
      />
      <WarningListModal open={showOverdue} onClose={() => setShowOverdue(false)} title="Overdue inspections" items={overdueItems} />

      {list.length === 0 ? (
        <EmptyResourceState
          emptyTitle="No inspections yet"
          emptySub="Schedule your first inspection from a unit's detail page."
          icon={<ClipboardCheck className="h-6 w-6" />}
          heroAction={<AddButton label="Schedule inspection" showPlus={false} onClick={() => router.push("/inspections/new")} />}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by type, property or unit…"
            view={view}
            onView={setView}
            rightFilters={
              showScope ? (
                <ToolbarFilter
                  label="View"
                  selected={[scope]}
                  onChange={(next) => setScope((next[0] as "mine" | "all" | `team:${string}`) ?? "mine")}
                  options={[
                    { value: "mine", label: "My work", icon: <User /> },
                    { value: "all", label: "All", icon: <Globe /> },
                    ...teams.map((t) => ({ value: `team:${t.id}`, label: t.name, icon: <Users /> })),
                  ]}
                />
              ) : null
            }
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

          {nothingAssignedToMe && (
            <EmptyResourceState
              emptyTitle="Nothing assigned to you"
              emptySub="There are inspections in your organisation — just none assigned to you right now."
              icon={<ClipboardCheck className="h-6 w-6" />}
              heroAction={<AddButton label="View all" showPlus={false} onClick={() => setScope("all")} />}
            />
          )}

          {!nothingAssignedToMe && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No inspections match your search.</p>
          )}

          {filtered.length > 0 && view === "cards" && (
            <div className="grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((insp) => (
                <InspectionCard
                  key={insp.id}
                  insp={insp as unknown as Inspection}
                  onOpen={() => router.push(`/inspections/${insp.id}`)}
                />
              ))}
            </div>
          )}

          {filtered.length > 0 && view === "list" && (
            <div className="min-h-0 flex-1 space-y-2 overflow-auto">
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
                            {formatPropertyLabel(unit, { fallback: "" })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {inspectionDateLabel(insp as unknown as Inspection)}
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
