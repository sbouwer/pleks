/**
 * app/(dashboard)/listings/[slug]/compare/page.tsx — side-by-side applicant comparison for a listing
 *
 * Route:  /listings/[slug]/compare
 * Auth:   gatewaySSR (agent workspace — service client, explicit org_id filter on every query)
 * Data:   the listing (by public_slug, in the active org) and its submitted, comparable applications
 * Notes:  A9: reached from the listing quickbar's "Compare applicants", offered only when at least two applications
 *         are comparable. The link and this query share ./comparable.ts, and the filters mirror the listing page's
 *         (submitted, not deleted), so the link never opens a shorter list than it counted.
 *         Until A9 this was an orphaned client page that read `?listing=<id>` through the browser client, bounded
 *         by RLS's "any org I belong to" rather than the active org, and sent each applicant's motivation text and
 *         bank-extraction column to the browser to render a mark and an income. It is now a server component: the
 *         listing is resolved like the listing page's (slug + active org), and the motivation never leaves the
 *         server — only whether there is one.
 *         Income is the DECLARED figure, and labelled so. The old page preferred a bank-extracted average, but as at
 *         e29314ef the only writer of that column (app/api/applications/[id]/documents/route.ts) stores a boolean, so
 *         the bank figure was always null; read it again when ADDENDUM_14D persists the extracted object.
 *         At most COMPARE_LIMIT rows, best pre-screen first, unscored last, ties by submission order (stable at the
 *         cut); the footer says when more exist.
 */
import { redirect, notFound } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { COMPARABLE_STAGE1, COMPARE_LIMIT } from "./comparable"

interface AppRow {
  id: string
  first_name: string | null
  last_name: string | null
  gross_monthly_income_cents: number | null
  employment_type: string | null
  prescreen_score: number | null
  fitscore: number | null
  prescreen_affordability_flag: boolean
  has_co_applicant: boolean
  applicant_motivation: string | null
  documents_submitted: string[] | null
}

export default async function ComparePage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: listing, error: lErr } = await db
    .from("listings")
    .select("id")
    .eq("public_slug", slug)
    .eq("org_id", orgId)
    .maybeSingle()
  if (lErr) logQueryError("ComparePage listing", lErr)
  if (!listing) notFound()

  const { data, error, count } = await db
    .from("applications")
    .select(
      "id, first_name, last_name, gross_monthly_income_cents, employment_type, prescreen_score, fitscore, prescreen_affordability_flag, has_co_applicant, applicant_motivation, documents_submitted",
      { count: "exact" },
    )
    .eq("listing_id", listing.id)
    .eq("org_id", orgId)
    .in("stage1_status", [...COMPARABLE_STAGE1])
    .not("submitted_at", "is", null)
    .is("deleted_at", null)
    .order("prescreen_score", { ascending: false, nullsFirst: false })
    .order("submitted_at", { ascending: true })
    .limit(COMPARE_LIMIT)
  if (error) logQueryError("ComparePage applications", error)
  const apps = (data ?? []) as unknown as AppRow[]
  const total = count ?? apps.length

  return (
    <div>
      <BackLink href={`/listings/${slug}`} label="Listing" />
      <h1 className="font-heading text-3xl mb-6">Compare Applicants</h1>
      <Card>
        <CardContent className="pt-4">
          {error ? (
            <p className="text-sm text-muted-foreground">Could not load the applicants. Try again in a moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Applicant</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Declared income/mo</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Affordability</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Employment</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Pre-screen</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">FitScore</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">Docs</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a) => {
                    const name = `${a.first_name || ""} ${a.last_name || ""}`.trim()
                    const income = a.gross_monthly_income_cents
                    const docsComplete = (a.documents_submitted || []).length >= 4

                    return (
                      <tr key={a.id} className="border-b border-border hover:bg-surface">
                        <td className="py-2 px-3 font-medium">
                          {name}
                          {a.has_co_applicant && <span className="text-xs text-muted-foreground ml-1">(Joint)</span>}
                        </td>
                        <td className="py-2 px-3 text-right">{income ? formatZAR(income) : "—"}</td>
                        <td className="py-2 px-3 text-right">
                          {a.prescreen_affordability_flag
                            ? <span className="text-warning">Over 30%</span>
                            : <span className="text-success">OK</span>}
                        </td>
                        <td className="py-2 px-3 capitalize">{a.employment_type || "—"}</td>
                        <td className="py-2 px-3 text-right">{a.prescreen_score ?? "—"}/45</td>
                        <td className="py-2 px-3 text-right font-heading">{a.fitscore === null ? "—" : `${a.fitscore}/100`}</td>
                        <td className="py-2 px-3 text-center">{docsComplete ? "✅" : "⚠️"}</td>
                        <td className="py-2 px-3 text-center">{a.applicant_motivation ? "📝" : "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-4">
                {total > apps.length
                  ? `Showing the top ${apps.length} of ${total} by pre-screen score.`
                  : "All applicants shown regardless of score (D-006)."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
