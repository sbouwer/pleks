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
import { DetailPageLayout } from "@/components/detail/DetailPageLayout"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { ApplicationTriageList, type TriageApp } from "./ApplicationTriageList"
import { ListingQuickbar } from "./ListingQuickbar"

const LISTING_STATUS: Record<string, DetailStatus> = {
  active: { kind: "occupied", label: "Active" },
  paused: { kind: "neutral", label: "Paused" },
  filled: { kind: "occupied", label: "Filled" },
  expired: { kind: "flag", label: "Expired" },
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

interface ListingDetail {
  id: string; public_slug: string | null; asking_rent_cents: number; available_from: string | null
  requirements: string | null; status: string; application_fee_cents: number; views_count: number | null
  closes_at: string | null; description: string | null; min_income_multiple: number | null; pet_friendly: boolean | null
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
    .select("id, public_slug, asking_rent_cents, available_from, requirements, status, application_fee_cents, views_count, closes_at, description, min_income_multiple, pet_friendly, units(unit_number, properties(name))")
    .eq("public_slug", slug)
    .eq("org_id", orgId)
    .maybeSingle()
  if (lErr) logQueryError("ListingDetail listing", lErr)
  if (!listingRaw) notFound()
  const listing = listingRaw as unknown as ListingDetail

  // SUBMITTED applications only — pre-screened-but-not-submitted (submitted_at IS NULL) never surface to the agent.
  const { data: appsRaw, error: aErr } = await db
    .from("applications")
    .select("id, first_name, last_name, applicant_email, applicant_type, has_co_applicant, stage1_status, stage2_status, prescreen_score, fitscore, gross_monthly_income_cents")
    .eq("listing_id", listing.id)
    .eq("org_id", orgId)
    .not("submitted_at", "is", null)
    .is("deleted_at", null)
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

  const facts: DetailFact[] = [
    { k: "Rent", v: `${formatZAR(listing.asking_rent_cents)}/mo` },
    { k: "Available", v: listing.available_from ?? "Now" },
    { k: "Closes", v: listing.closes_at ? new Date(listing.closes_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—" },
    { k: "Application fee", v: formatZAR(listing.application_fee_cents) },
    { k: "Views", v: String(listing.views_count ?? 0) },
    { k: "Submitted", v: String(triage.length) },
  ]

  return (
    <DetailPageLayout
      category="Listings"
      backHref="/listings"
      title={`${unit?.unit_number ?? "Unit"}, ${property?.name ?? "Property"}`}
      status={LISTING_STATUS[listing.status] ?? { kind: "neutral", label: listing.status }}
      facts={facts}
      actions={
        <ListingQuickbar
          listingId={listing.id}
          publicUrl={applyUrl}
          submittedCount={triage.length}
          initial={{
            asking_rent_cents: listing.asking_rent_cents,
            available_from: listing.available_from,
            closes_at: listing.closes_at,
            description: listing.description,
            requirements: listing.requirements,
            min_income_multiple: listing.min_income_multiple,
            pet_friendly: !!listing.pet_friendly,
            status: listing.status,
          }}
        />
      }
      fill
    >
      <ApplicationTriageList slug={slug} applications={triage} />
    </DetailPageLayout>
  )
}
