/**
 * app/(dashboard)/listings/[slug]/page.tsx — one listing: its details + the applicants who applied to it
 *
 * Route:  /listings/[slug]
 * Auth:   gatewaySSR (agent workspace — service client, explicit org_id filter on every query)
 * Data:   listings (by public_slug) + its applications (listing_id) → units → properties
 * Notes:  the per-listing drill-down under the /listings IA. Listings are keyed by public_slug — the same
 *         id the public /apply/[slug] page uses. Applicant rows link to /listings/[slug]/applications/[id].
 */
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { BackLink } from "@/components/ui/BackLink"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

interface ListingDetail {
  id: string
  public_slug: string | null
  asking_rent_cents: number
  available_from: string | null
  requirements: string | null
  status: string
  application_fee_cents: number
  views_count: number | null
  applications_count: number | null
  units: { unit_number: string; properties: { name: string } | { name: string }[] } | { unit_number: string; properties: { name: string } }[]
}

interface ApplicantRow {
  id: string
  first_name: string | null
  last_name: string | null
  applicant_email: string
  stage1_status: string
  stage2_status: string | null
  prescreen_score: number | null
  fitscore: number | null
  gross_monthly_income_cents: number | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function humanizeStage(app: { stage1_status: string; stage2_status: string | null }): string {
  const s = app.stage2_status ?? app.stage1_status
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function ListingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: listingRaw, error: lErr } = await db
    .from("listings")
    .select("id, public_slug, asking_rent_cents, available_from, requirements, status, application_fee_cents, views_count, applications_count, units(unit_number, properties(name))")
    .eq("public_slug", slug)
    .eq("org_id", orgId)
    .maybeSingle()
  if (lErr) logQueryError("ListingDetail listing", lErr)
  if (!listingRaw) notFound()
  const listing = listingRaw as unknown as ListingDetail

  const { data: appsRaw, error: aErr } = await db
    .from("applications")
    .select("id, first_name, last_name, applicant_email, stage1_status, stage2_status, prescreen_score, fitscore, gross_monthly_income_cents")
    .eq("listing_id", listing.id)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
  if (aErr) logQueryError("ListingDetail apps", aErr)
  const applicants = (appsRaw ?? []) as unknown as ApplicantRow[]

  const unit = unwrap(listing.units)
  const property = unit ? unwrap(unit.properties) : null
  const applyUrl = listing.public_slug ? `${APP_URL}/apply/${listing.public_slug}` : null

  return (
    <div className="space-y-6">
      <BackLink href="/listings" label="Listings" />

      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Listing</p>
        <h1 className="font-heading text-3xl">{unit?.unit_number ?? "Unit"}, {property?.name ?? "Property"}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>{formatZAR(listing.asking_rent_cents)}/mo</span>
          <span>Status: {listing.status}</span>
          {listing.available_from && <span>Available {listing.available_from}</span>}
          <span>Application fee {formatZAR(listing.application_fee_cents)}</span>
          <span>{listing.views_count ?? 0} views</span>
          <span>{listing.applications_count ?? applicants.length} applications</span>
        </div>
        {applyUrl && (
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-md">{applyUrl}</code>
            <a href={applyUrl} target="_blank" rel="noreferrer" className="pa-link text-xs">Open public page →</a>
          </div>
        )}
        {listing.requirements && (
          <p className="text-sm text-muted-foreground whitespace-pre-line border-l-2 border-border pl-3">{listing.requirements}</p>
        )}
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Applicants ({applicants.length})
        </h2>
        {applicants.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No applicants yet. Share the public link above to start receiving applications.</p>
        ) : (
          applicants.map((app) => {
            const name = `${app.first_name || ""} ${app.last_name || ""}`.trim() || app.applicant_email
            return (
              <Link key={app.id} href={`/listings/${slug}/applications/${app.id}`}>
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
                      {app.prescreen_score !== null && app.fitscore === null && <span className="text-sm text-muted-foreground">{app.prescreen_score}/45</span>}
                      <span className="text-xs text-muted-foreground">{humanizeStage(app)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })
        )}
      </section>
    </div>
  )
}
