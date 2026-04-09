"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { BulkDecidePanel } from "@/components/applications/BulkDecidePanel"
import { Users, Copy, Check, ExternalLink, Plus } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchApplicationsAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { useUser } from "@/hooks/useUser"

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
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy}>
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </Button>
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
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" render={<a href={listingUrl} target="_blank" rel="noreferrer" />}>
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

export function ApplicationsPageClient({ orgId, listings }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const queryKey = OPERATIONAL_QUERY_KEYS.applications(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchApplicationsAction(orgId),
    staleTime: STALE_TIME.applications,
  })

  const prescreenReady = list.filter((a) => a.stage1_status === "pre_screen_complete")
  const screeningComplete = list.filter((a) => a.stage2_status === "screening_complete")

  // Group applications by listing id
  const grouped = new Map<string, { listing: ListingShape; apps: typeof list }>()
  const noListing: typeof list = []

  for (const app of list) {
    const raw = app.listings
    const listing = (Array.isArray(raw) ? raw[0] : raw) as unknown as ListingShape | null | undefined
    if (!listing?.id) { noListing.push(app); continue }
    if (!grouped.has(listing.id)) grouped.set(listing.id, { listing, apps: [] })
    grouped.get(listing.id)!.apps.push(app)
  }

  // Merge server listings (all active/paused) with grouped applications
  const merged = new Map<string, { listing: ListingShape; apps: typeof list }>()
  for (const sl of listings) {
    const units = (Array.isArray(sl.units) ? sl.units[0] : sl.units) as { unit_number: string; properties: { name: string } | { name: string }[] } | undefined
    let props: { name: string } | null = null
    if (units) {
      props = Array.isArray(units.properties) ? units.properties[0] : units.properties
    }
    if (!units || !props) continue
    merged.set(sl.id, {
      listing: { id: sl.id, public_slug: sl.public_slug, asking_rent_cents: sl.asking_rent_cents, applications_count: sl.applications_count, units: { unit_number: units.unit_number, properties: { name: props.name } } },
      apps: grouped.get(sl.id)?.apps ?? [],
    })
  }
  // Add listings from applications that aren't in server list
  for (const [id, entry] of grouped) {
    if (!merged.has(id)) merged.set(id, entry)
  }

  const mergedList = Array.from(merged.values())
  const hasContent = mergedList.length > 0 || noListing.length > 0

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
              <button onClick={() => queryClient.invalidateQueries({ queryKey })} className="text-brand hover:underline">
                Refresh
              </button>
            </div>
          )}
        </div>
        <Button render={<Link href="/properties" />}>
          <Plus className="size-4 mr-1.5" />
          New listing
        </Button>
      </div>

      {!hasContent ? (
        <div className="max-w-lg mx-auto py-12 text-center space-y-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-brand" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-heading">No active listings</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Listings are created from a unit. Once published, applicants apply via a
              shareable link and you&apos;ll manage everything here — review, shortlist,
              screen, and approve.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface-elevated p-4 text-left space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">How it works</p>
            <ol className="text-sm text-muted-foreground space-y-2">
              <li className="flex gap-2"><span className="text-brand font-medium shrink-0">1.</span> Go to a property and open a vacant unit</li>
              <li className="flex gap-2"><span className="text-brand font-medium shrink-0">2.</span> Click &ldquo;Create listing&rdquo; — set the asking rent and requirements</li>
              <li className="flex gap-2"><span className="text-brand font-medium shrink-0">3.</span> Share the link — applicants apply on their phone</li>
              <li className="flex gap-2"><span className="text-brand font-medium shrink-0">4.</span> Come back here to review and decide</li>
            </ol>
          </div>
          <Button render={<Link href="/properties" />}>
            <Plus className="size-4 mr-1.5" />
            Go to properties
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
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
    </div>
  )
}
