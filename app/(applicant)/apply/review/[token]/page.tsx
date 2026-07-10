/**
 * app/(applicant)/apply/review/[token]/page.tsx — VIEW-ONLY application review (ADDENDUM_14R §4).
 *
 * Route:  /apply/review/[token]  (the link in the "submitted to the agent" email; static segment wins over [slug])
 * Auth:   the [token] is the recipient's OWN credential — the lead's application_tokens token OR a co's access
 *         token. Read-only: no mutation path is exposed.
 * Data:   the stored applications.free_assessment (the Stage-1 review the agent received) rendered read-only via
 *         ReadOnlyAssessment. The review is aggregate/decoded only (no raw ID/bank/credit), so it's peer-safe (§5).
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { formatZAR } from "@/lib/constants"
import { ApplyPortalShell } from "../../applyPortalChrome"
import { ReadOnlyAssessment } from "../../[slug]/applyReview"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"
import type { Emp } from "../../[slug]/applyDomain"
import { fmtDateZA } from "@/lib/dates"

export const metadata = { referrer: "no-referrer" as const }

type ReviewListing = {
  asking_rent_cents: number | null; available_from: string | null
  units: { unit_number: string | null; properties: { name: string | null; suburb: string | null; city: string | null } | null } | null
}

export default async function ReviewViewPage({ params }: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params
  const service = await createServiceClient()
  const now = new Date().toISOString()

  // Dual credential → the application id: the lead's app token OR a co's (non-declined) access token.
  let appId: string | null = null
  const { data: leadTok, error: leadErr } = await service
    .from("application_tokens").select("application_id").eq("token", token).gt("expires_at", now).maybeSingle()
  logQueryError("review view lead token", leadErr)
  if (leadTok) appId = leadTok.application_id as string
  else {
    const { data: coTok, error: coErr } = await service
      .from("application_co_applicants").select("primary_application_id")
      .eq("access_token", token).is("declined_at", null).gt("access_token_expires", now).maybeSingle()
    logQueryError("review view co token", coErr)
    appId = (coTok?.primary_application_id as string | null) ?? null
  }
  if (!appId) notFound()

  const { data: app, error: appErr } = await service
    .from("applications")
    .select("free_assessment, employment_type, employer_name, listings(asking_rent_cents, available_from, units(unit_number, properties(name, suburb, city)))")
    .eq("id", appId).maybeSingle()
  logQueryError("review view app", appErr)
  const assessment = (app?.free_assessment as FreeAssessmentResult | null) ?? null
  if (!app || !assessment) notFound()

  const listing = (app.listings as unknown as ReviewListing | null) ?? null
  const unit = listing?.units ?? null
  const property = unit?.properties ?? null
  const stripTitle = [property?.name, unit?.unit_number ? `Unit ${unit.unit_number}` : null, property?.suburb ?? property?.city].filter(Boolean).join(" · ") || "Your application"
  const rentCents = listing?.asking_rent_cents ?? 0
  const availStr = listing?.available_from ? fmtDateZA(listing.available_from) : "Now"
  const emp: Emp = { employment_type: (app.employment_type as string | null) ?? "", employer: (app.employer_name as string | null) ?? "", start_date: "" }

  return (
    <ApplyPortalShell stripTitle={stripTitle} stripDetail={`${formatZAR(rentCents)}/mo · available ${availStr}`} begun={true}>
      <div className="w-full [@media(min-width:1024px)_and_(min-height:700px)]:max-w-3xl">
        <ReadOnlyAssessment assessment={assessment} askingRentCents={rentCents} emp={emp} />
      </div>
    </ApplyPortalShell>
  )
}
