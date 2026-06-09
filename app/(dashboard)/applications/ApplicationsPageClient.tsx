"use client"

/**
 * app/(dashboard)/applications/ApplicationsPageClient.tsx — Application list grouped by listing with bulk-decide panel
 *
 * Route:  /applications
 * Auth:   gateway (dashboard layout)
 * Data:   fetchApplicationsAction + server-side listings prop via React Query
 * Notes:  shared <ListToolbar> drives search (applicant name/email) + a multi-select Stage filter; the four
 *         stage buckets (pending/active/completed/arrears) mirror the StatusBadge derived from stage1/stage2
 *         status. Filtering runs before grouping; empty listing groups are hidden while a filter is active.
 *         List view = listing-grouped (default); Cards view = a flat applicant grid. Content fill-scrolls
 *         inside the list area (page itself does not scroll) — mirrors the suppliers reference layout.
 */
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { IconButton } from "@/components/ui/actions"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { ListToolbar, ToolbarFilter } from "@/components/ui/resource-list"
import { isMine } from "@/lib/work/myWorkFilter"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { BulkDecidePanel } from "@/components/applications/BulkDecidePanel"
import { Users, Copy, Check, ExternalLink } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchApplicationsAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { useUser } from "@/hooks/useUser"
import { useMyTeamIds } from "@/hooks/useMyTeamIds"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

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

type StageBucket = "pending" | "active" | "completed" | "arrears"

/** One application row as returned by fetchApplications (element of the inferred array). */
type ApplicationRow = Awaited<ReturnType<typeof fetchApplicationsAction>>[number]

/** The single stage bucket displayed on each card's StatusBadge — stage2 takes precedence over stage1. */
function appStage(app: { stage1_status: string; stage2_status: string | null }): StageBucket {
  if (app.stage2_status) return STAGE2_MAP[app.stage2_status] ?? "pending"
  return STAGE1_MAP[app.stage1_status] ?? "pending"
}

/** Filter options mirror the displayed StatusBadge labels (Pending / Active / Completed / Arrears). */
const STAGE_FILTER_OPTIONS: { value: StageBucket; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "arrears", label: "Declined / Withdrawn" },
]

interface ListingShape {
  id: string
  public_slug: string | null
  asking_rent_cents: number
  applications_count: number | null
  units: { unit_number: string; properties: { name: string } }
}

interface ListingRow {
  id: string
  public_slug: string | null
  asking_rent_cents: number
  applications_count: number | null
  status: string
  units: { unit_number: string; properties: { name: string } } | { unit_number: string; properties: { name: string } }[]
}

interface Props {
  orgId: string
  listings: ListingRow[]
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <IconButton icon={copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />} label="Copy link" onClick={copy} />
  )
}

function ListingHeader({ listing, appCount }: { listing: ListingShape; appCount: number }) {
  const listingUrl = listing.public_slug ? `${APP_URL}/apply/${listing.public_slug}` : null
  let applicantLabel: string
  if (appCount === 0) { applicantLabel = "No applicants yet" }
  else { applicantLabel = `${appCount} applicant${appCount !== 1 ? "s" : ""}` }
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">
          {listing.units.unit_number}, {listing.units.properties.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatZAR(listing.asking_rent_cents)}/mo
          {" · "}
          {applicantLabel}
        </p>
      </div>
      {listingUrl && (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-2 py-1 rounded truncate">{listingUrl}</code>
          <CopyButton url={listingUrl} />
          <a href={listingUrl} target="_blank" rel="noreferrer" className="pa-iconbtn" aria-label="Open listing"><ExternalLink className="size-3.5" /></a>
        </div>
      )}
    </div>
  )
}

/** Resolve the (possibly array-wrapped) listing on an application row to its unit/property label. */
function appListingLabel(app: { listings?: unknown }): string | null {
  const raw = (app as { listings?: unknown }).listings
  const listing = (Array.isArray(raw) ? raw[0] : raw) as ListingShape | null | undefined
  if (!listing?.units) return null
  return `${listing.units.unit_number}, ${listing.units.properties.name}`
}

/** Card-view tile (the "Cards" toggle) — flat applicant tile mirroring the grouped row's data. */
function ApplicantCard({
  app, onOpen,
}: Readonly<{
  app: ApplicationRow
  onOpen: () => void
}>) {
  const name = `${app.first_name || ""} ${app.last_name || ""}`.trim() || app.applicant_email
  const listingLabel = appListingLabel(app)
  const stage: StageBucket = app.stage2_status
    ? (STAGE2_MAP[app.stage2_status] || "pending")
    : (STAGE1_MAP[app.stage1_status] || "pending")
  return (
    <div
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{name}</p>
            {app.is_foreign_national && <span className="shrink-0 rounded bg-info-bg px-1.5 py-0.5 text-[10px] text-info">Foreign</span>}
            {app.has_co_applicant && <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px]">Joint</span>}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{listingLabel ?? "No listing"}</p>
        </div>
        <StatusBadge status={stage} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{app.gross_monthly_income_cents ? `Income: ${formatZAR(app.gross_monthly_income_cents)}/mo` : ""}</span>
        {app.fitscore !== null && <span className="font-heading text-base text-foreground">{app.fitscore}/100</span>}
        {app.prescreen_score !== null && app.fitscore === null && <span>{app.prescreen_score}/45</span>}
      </div>
    </div>
  )
}

/** Group filtered applications under their listing, merged with the server's active/paused listings.
 *  While a filter is active, listing groups with no matching applications are dropped. */
function buildMergedGroups<A extends { listings?: unknown }>(
  filteredList: A[],
  listings: ListingRow[],
  isFiltering: boolean,
): { mergedList: { listing: ListingShape; apps: A[] }[]; noListing: A[] } {
  const grouped = new Map<string, { listing: ListingShape; apps: A[] }>()
  const noListing: A[] = []
  for (const app of filteredList) {
    const raw = app.listings
    const listing = (Array.isArray(raw) ? raw[0] : raw) as ListingShape | null | undefined
    if (!listing?.id) { noListing.push(app); continue }
    if (!grouped.has(listing.id)) grouped.set(listing.id, { listing, apps: [] })
    grouped.get(listing.id)!.apps.push(app)
  }
  const merged = new Map<string, { listing: ListingShape; apps: A[] }>()
  for (const sl of listings) {
    const units = (Array.isArray(sl.units) ? sl.units[0] : sl.units) as { unit_number: string; properties: { name: string } | { name: string }[] } | undefined
    let props: { name: string } | null = null
    if (units) props = Array.isArray(units.properties) ? units.properties[0] : units.properties
    if (!units || !props) continue
    merged.set(sl.id, {
      listing: { id: sl.id, public_slug: sl.public_slug, asking_rent_cents: sl.asking_rent_cents, applications_count: sl.applications_count, units: { unit_number: units.unit_number, properties: { name: props.name } } },
      apps: grouped.get(sl.id)?.apps ?? [],
    })
  }
  for (const [id, entry] of grouped) {
    if (!merged.has(id)) merged.set(id, entry)
  }
  const mergedList = Array.from(merged.values()).filter((entry) => !isFiltering || entry.apps.length > 0)
  return { mergedList, noListing }
}

export function ApplicationsPageClient({ orgId, listings }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useUser()
  const { teamIds } = useMyTeamIds()
  const queryKey = OPERATIONAL_QUERY_KEYS.applications(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchApplicationsAction(orgId),
    staleTime: STALE_TIME.applications,
  })

  const [scope, setScope] = useState<"mine" | "all">("mine")
  const [search, setSearch] = useState("")
  const [stages, setStages] = useState<string[]>([])
  const [view, setView] = useState<"list" | "cards">("list")

  // My work / All (ADDENDUM_TEAMS Layer 0) — scope the applications (the listing frame stays org-wide as
  // context); null assignee = Everyone/Org, shown only under "All".
  const scopedList = scope === "mine" && user?.id
    ? list.filter((a) => isMine(a as { assigned_user_id: string | null; assigned_team_id: string | null }, user.id, teamIds))
    : list

  const prescreenReady = scopedList.filter((a) => a.stage1_status === "pre_screen_complete")
  const screeningComplete = scopedList.filter((a) => a.stage2_status === "screening_complete")

  // Apply search (applicant name / email) + stage filter before grouping.
  const q = search.trim().toLowerCase()
  const filteredList = scopedList.filter((a) => {
    const name = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase()
    const matchSearch = !q || name.includes(q) || (a.applicant_email?.toLowerCase().includes(q) ?? false)
    const matchStage = stages.length === 0 || stages.includes(appStage(a))
    return matchSearch && matchStage
  })
  const isFiltering = q.length > 0 || stages.length > 0

  const { mergedList, noListing } = buildMergedGroups(filteredList, listings, isFiltering)
  const hasContent = mergedList.length > 0 || noListing.length > 0
  // The toolbar is only meaningful once there's underlying data to filter.
  const showToolbar = list.length > 0
  const filteredCount = filteredList.length
  const appWord = scopedList.length === 1 ? "application" : "applications"
  const countLabel = isFiltering ? `${filteredCount} of ${scopedList.length} ${appWord}` : `${scopedList.length} ${appWord}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeader
        eyebrow="Operations"
        title="Applications"
        headline="Rental applications"
        sub={
          (list.length > 0 || dataUpdatedAt > 0) ? (
            <div className="space-y-0.5">
              {/* Always render (even "0 ready") so toggling the filter doesn't jump the sticky header. */}
              <p>{prescreenReady.length} ready to review &middot; {screeningComplete.length} screening complete</p>
              {dataUpdatedAt > 0 && (
                <span className="flex items-center gap-2 text-xs">
                  Updated {relativeTime(new Date(dataUpdatedAt))}
                  <button type="button" className="pa-link" onClick={() => queryClient.invalidateQueries({ queryKey })}>Refresh</button>
                </span>
              )}
            </div>
          ) : undefined
        }
        action={<AddButton label="New listing" onClick={() => router.push("/properties")} />}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {showToolbar && (
          <div className="space-y-2">
            <ListToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search applicants by name or email…"
              view={view}
              onView={setView}
              rightFilters={
                <ToolbarFilter
                  label="View"
                  selected={[scope]}
                  onChange={(next) => setScope((next[0] as "mine" | "all") ?? "mine")}
                  options={[{ value: "mine", label: "My work" }, { value: "all", label: "All" }]}
                />
              }
              filters={
                <ToolbarFilter
                  label="Stage"
                  multiple
                  selected={stages}
                  onChange={setStages}
                  options={STAGE_FILTER_OPTIONS}
                />
              }
            />
            <p className="text-xs text-muted-foreground">{countLabel}</p>
          </div>
        )}

        {showToolbar && isFiltering && !hasContent && (
          <p className="py-8 text-center text-sm text-muted-foreground">No applications match your filters.</p>
        )}

        {!hasContent && !(showToolbar && isFiltering) && (
          <EmptyResourceState
          emptyTitle="No active listings"
          emptySub="Listings are created from a unit. Once published, applicants apply via a shareable link and you'll manage everything here — review, shortlist, screen, and approve."
          icon={<Users className="h-6 w-6" />}
          heroAction={<AddButton label="Go to properties" showPlus={false} onClick={() => router.push("/properties")} />}
        >
          <div className="space-y-3 rounded-[var(--r-button)] border border-border/60 bg-muted/30 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">How it works</p>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="shrink-0 font-medium text-primary">1.</span> Go to a property and open a vacant unit</li>
              <li className="flex gap-2"><span className="shrink-0 font-medium text-primary">2.</span> Click &ldquo;Create listing&rdquo; — set the asking rent and requirements</li>
              <li className="flex gap-2"><span className="shrink-0 font-medium text-primary">3.</span> Share the link — applicants apply on their phone</li>
              <li className="flex gap-2"><span className="shrink-0 font-medium text-primary">4.</span> Come back here to review and decide</li>
            </ol>
          </div>
          </EmptyResourceState>
        )}

        {/* List view (default) — listing-grouped. Scrolls internally; page itself does not scroll. */}
        {hasContent && view === "list" && (
          <div className="min-h-0 flex-1 space-y-6 overflow-auto">
            {mergedList.map(({ listing, apps }) => {
              const bulkEligible = apps.filter((a) => a.stage1_status === "pre_screen_complete" && !a.stage2_status)
              return (
              <div key={listing.id} className="space-y-2">
                <ListingHeader listing={listing} appCount={apps.length} />
                {apps.map((app) => {
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
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {app.gross_monthly_income_cents ? `Income: ${formatZAR(app.gross_monthly_income_cents)}/mo` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {app.fitscore !== null && <span className="font-heading text-lg">{app.fitscore}/100</span>}
                            {app.prescreen_score !== null && !app.fitscore && <span className="text-sm text-muted-foreground">{app.prescreen_score}/45</span>}
                            <StatusBadge status={app.stage2_status ? (STAGE2_MAP[app.stage2_status] || "pending") : (STAGE1_MAP[app.stage1_status] || "pending")} />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
                {bulkEligible.length >= 2 && user && (
                  <BulkDecidePanel
                    agentId={user.id}
                    applicants={bulkEligible.map((a) => ({
                      id: a.id,
                      name: `${a.first_name || ""} ${a.last_name || ""}`.trim() || a.applicant_email,
                      prescreenScore: a.prescreen_score ?? null,
                    }))}
                    onDone={() => queryClient.invalidateQueries({ queryKey })}
                  />
                )}
              </div>
              )
            })}

            {noListing.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Other</p>
                {noListing.map((app) => {
                  const name = `${app.first_name || ""} ${app.last_name || ""}`.trim() || app.applicant_email
                  return (
                    <Link key={app.id} href={`/applications/${app.id}`}>
                      <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                        <CardContent className="flex items-center justify-between pt-4">
                          <div>
                            <p className="font-medium">{name}</p>
                            <p className="text-sm text-muted-foreground">
                              {app.gross_monthly_income_cents ? `Income: ${formatZAR(app.gross_monthly_income_cents)}/mo` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {app.fitscore !== null && <span className="font-heading text-lg">{app.fitscore}/100</span>}
                            {app.prescreen_score !== null && !app.fitscore && <span className="text-sm text-muted-foreground">{app.prescreen_score}/45</span>}
                            <StatusBadge status={app.stage2_status ? (STAGE2_MAP[app.stage2_status] || "pending") : (STAGE1_MAP[app.stage1_status] || "pending")} />
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

        {/* Cards view — flat applicant grid over the filtered list (grouping flattened). */}
        {hasContent && view === "cards" && filteredList.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No applicants yet.</p>
        )}
        {hasContent && view === "cards" && filteredList.length > 0 && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
            {filteredList.map((app) => (
              <ApplicantCard
                key={app.id}
                app={app}
                onOpen={() => router.push(`/applications/${app.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
