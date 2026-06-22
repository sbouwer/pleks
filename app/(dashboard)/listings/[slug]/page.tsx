/**
 * app/(dashboard)/listings/[slug]/page.tsx — one listing: its details + the SUBMITTED applications (triage)
 *
 * Route:  /listings/[slug]
 * Auth:   gatewaySSR (agent workspace — service client, explicit org_id filter on every query)
 * Data:   listings (by public_slug) + its SUBMITTED applications (stage1_consent_given = true; drafts excluded)
 *         + latest 14M ruling per app (set-based: one query, highest iteration per app) + co-applicant counts.
 * Notes:  Level 2 of the drill-down. The applicant list is the canonical triage list-line (type · Name +N ·
 *         ruling match · 👁/✓/✗) — ✓ = shortlist mark, ✗ = decline (with undo). Rows → /listings/[slug]/applications/[id].
 */
import { redirect, notFound } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { BackLink } from "@/components/ui/BackLink"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { ApplicationTriageList, type TriageApp } from "./ApplicationTriageList"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

interface ListingDetail {
  id: string; public_slug: string | null; asking_rent_cents: number; available_from: string | null
  requirements: string | null; status: string; application_fee_cents: number; views_count: number | null
  units: { unit_number: string; properties: { name: string } | { name: string }[] } | { unit_number: string; properties: { name: string } }[]
}
interface EvalRow { application_id: string; ruling_tier: string; affordability_ratio_pct: number | null; confidence_tier: string; iteration_number: number }

export default async function ListingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: listingRaw, error: lErr } = await db
    .from("listings")
    .select("id, public_slug, asking_rent_cents, available_from, requirements, status, application_fee_cents, views_count, units(unit_number, properties(name))")
    .eq("public_slug", slug)
    .eq("org_id", orgId)
    .maybeSingle()
  if (lErr) logQueryError("ListingDetail listing", lErr)
  if (!listingRaw) notFound()
  const listing = listingRaw as unknown as ListingDetail

  // SUBMITTED applications only — drafts (stage1_consent_given not true) never surface to the agent.
  const { data: appsRaw, error: aErr } = await db
    .from("applications")
    .select("id, first_name, last_name, applicant_email, applicant_type, has_co_applicant, stage1_status, stage2_status, prescreen_score, fitscore, gross_monthly_income_cents")
    .eq("listing_id", listing.id)
    .eq("org_id", orgId)
    .eq("stage1_consent_given", true)
    .order("created_at", { ascending: false })
  if (aErr) logQueryError("ListingDetail apps", aErr)
  const apps = (appsRaw ?? []) as Array<Record<string, unknown>>
  const appIds = apps.map((a) => a.id as string)

  // Latest 14M ruling per app — ONE query, pick highest iteration per app (PostgREST has no DISTINCT ON).
  const rulingByApp = new Map<string, EvalRow>()
  const coCountByApp = new Map<string, number>()
  if (appIds.length > 0) {
    const [evalsResult, cosResult] = await Promise.all([
      db.from("application_screening_evaluations")
        .select("application_id, ruling_tier, affordability_ratio_pct, confidence_tier, iteration_number")
        .in("application_id", appIds).order("iteration_number", { ascending: false }),
      db.from("application_co_applicants").select("primary_application_id").in("primary_application_id", appIds),
    ])
    logQueryError("ListingDetail rulings", evalsResult.error)
    logQueryError("ListingDetail co-applicants", cosResult.error)
    for (const e of (evalsResult.data ?? []) as unknown as EvalRow[]) {
      if (!rulingByApp.has(e.application_id)) rulingByApp.set(e.application_id, e)
    }
    for (const c of cosResult.data ?? []) {
      const pid = (c as { primary_application_id: string }).primary_application_id
      coCountByApp.set(pid, (coCountByApp.get(pid) ?? 0) + 1)
    }
  }

  const triage: TriageApp[] = apps.map((a) => {
    const r = rulingByApp.get(a.id as string)
    return {
      id: a.id as string,
      name: `${(a.first_name as string) || ""} ${(a.last_name as string) || ""}`.trim() || (a.applicant_email as string),
      type: (a.applicant_type as string | null) ?? "individual",
      coCount: coCountByApp.get(a.id as string) ?? 0,
      incomeCents: (a.gross_monthly_income_cents as number | null) ?? null,
      stage1Status: a.stage1_status as string,
      stage2Status: (a.stage2_status as string | null) ?? null,
      prescreenScore: (a.prescreen_score as number | null) ?? null,
      fitscore: (a.fitscore as number | null) ?? null,
      ruling: r ? { tier: r.ruling_tier, affordabilityPct: r.affordability_ratio_pct, confidenceTier: r.confidence_tier } : null,
    }
  })

  const unit = unwrap(listing.units)
  const property = unit ? unwrap(unit.properties) : null
  const applyUrl = listing.public_slug ? `${APP_URL}/apply/${listing.public_slug}` : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BackLink href="/listings" label="Listings" />
      <ResourcePageHeader
        eyebrow="Operations"
        title="Listing"
        headline={`${unit?.unit_number ?? "Unit"}, ${property?.name ?? "Property"}`}
        sub={
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span>{formatZAR(listing.asking_rent_cents)}/mo</span>
              <span>Status: {listing.status}</span>
              {listing.available_from && <span>Available {listing.available_from}</span>}
              <span>Fee {formatZAR(listing.application_fee_cents)}</span>
              <span>{listing.views_count ?? 0} views</span>
              <span>{triage.length} submitted</span>
            </div>
            {listing.requirements && (
              <p className="whitespace-pre-line border-l-2 border-border pl-3 text-sm text-muted-foreground">{listing.requirements}</p>
            )}
          </div>
        }
        action={applyUrl ? <a href={applyUrl} target="_blank" rel="noreferrer" className="pa-link text-xs">Open public page →</a> : undefined}
      />
      <ApplicationTriageList slug={slug} applications={triage} />
    </div>
  )
}
