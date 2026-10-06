"use client"

/**
 * app/(dashboard)/listings/[slug]/compare/page.tsx — side-by-side applicant comparison for a listing
 *
 * Route:  /listings/[slug]/compare?listing=<listing id>
 * Auth:   gateway (dashboard layout)
 * Data:   the listing's submitted, comparable applications via the browser Supabase client (agent session; RLS)
 * Notes:  A9: reached from the listing quickbar's "Compare applicants", offered only when at least two applications
 *         are comparable. The page and that link share ./comparable.ts, and the query mirrors the listing page's
 *         (submitted, not deleted), so the link never opens a shorter list than it promised. This header said
 *         `?ids=<id,…>` until A9; the page has always read `?listing`. The [slug] param only scopes the back-link.
 */
import { useEffect, useState } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import { Suspense } from "react"
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
  documents_submitted: string[]
  bank_statement_extracted: Record<string, unknown> | null
}

function CompareContent() {
  const searchParams = useSearchParams()
  const listingId = searchParams.get("listing")
  const [apps, setApps] = useState<AppRow[]>([])

  useEffect(() => {
    if (!listingId) return
    const supabase = createClient()
    supabase
      .from("applications")
      .select("id, first_name, last_name, gross_monthly_income_cents, employment_type, prescreen_score, fitscore, prescreen_affordability_flag, has_co_applicant, applicant_motivation, documents_submitted, bank_statement_extracted")
      .eq("listing_id", listingId)
      .in("stage1_status", [...COMPARABLE_STAGE1])
      .not("submitted_at", "is", null)
      .is("deleted_at", null)
      .order("prescreen_score", { ascending: false })
      .limit(COMPARE_LIMIT)
      .then(({ data, error }) => {
        if (error) logQueryError("CompareContent applications", error)
        setApps((data as unknown as AppRow[]) || [])
      })
  }, [listingId])

  if (!listingId) {
    return <p className="text-muted-foreground">Select a listing to compare applicants.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Applicant</th>
            <th className="text-right py-2 px-3 text-muted-foreground font-medium">Income/mo</th>
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
            const bankIncome = (a.bank_statement_extracted as Record<string, unknown>)?.avg_monthly_income_cents as number | null
            const income = bankIncome ?? a.gross_monthly_income_cents
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
                <td className="py-2 px-3 text-right font-heading">{a.fitscore !== null ? `${a.fitscore}/100` : "—"}</td>
                <td className="py-2 px-3 text-center">{docsComplete ? "✅" : "⚠️"}</td>
                <td className="py-2 px-3 text-center">{a.applicant_motivation ? "📝" : "—"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-4">All applicants shown regardless of score (D-006).</p>
    </div>
  )
}

export default function ComparePage() {
  const { slug } = useParams<{ slug: string }>()
  return (
    <div>
      <BackLink href={`/listings/${slug}`} label="Listing" />
      <h1 className="font-heading text-3xl mb-6">Compare Applicants</h1>
      <Card>
        <CardContent className="pt-4">
          <Suspense>
            <CompareContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
