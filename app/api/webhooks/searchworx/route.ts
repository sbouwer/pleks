import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { calculateFullFitScore } from "@/lib/screening/fitScore"
import { sendCreditReportToApplicant } from "@/lib/screening/sendCreditReport"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendScreeningComplete } from "@/lib/applications/emails"

export async function POST(req: Request) {
  const body = await req.json()

  // Searchworx webhook signature verification — wire up once API credentials are configured

  const applicationId = body.reference
  if (!applicationId) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: application } = await supabase
    .from("applications")
    .select("id, org_id, is_foreign_national, employment_type, gross_monthly_income_cents, listing_id, bank_statement_extracted, applicant_motivation")
    .eq("id", applicationId)
    .single()

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  try {
    // Normalise Searchworx response
    const creditScore = body.credit_score ?? null
    const tpnRating = body.tpn_rental_profile?.overall_rating ?? null
    const judgementsCount = body.judgements_count ?? 0
    const adverseCount = body.adverse_listings_count ?? 0

    // Get listing rent
    const { data: listing } = await supabase
      .from("listings")
      .select("asking_rent_cents")
      .eq("id", application.listing_id)
      .single()

    const rentCents = listing?.asking_rent_cents ?? 0
    const incomeCents = (application.bank_statement_extracted as Record<string, unknown>)?.avg_monthly_income_cents as number ?? application.gross_monthly_income_cents

    // Calculate full FitScore
    const { total, components, affordabilityFlag } = calculateFullFitScore(
      creditScore,
      incomeCents,
      rentCents,
      tpnRating,
      application.employment_type,
      judgementsCount,
      adverseCount,
      0, // references — agent-captured
      application.is_foreign_national
    )

    // Update application
    await supabase.from("applications").update({
      searchworx_check_id: body.check_reference || body.id,
      searchworx_extracted_data: body,
      searchworx_check_status: "complete",
      searchworx_checked_at: new Date().toISOString(),
      fitscore: total,
      fitscore_components: { components, total, affordability_flag: affordabilityFlag },
      fitscore_calculated_at: new Date().toISOString(),
      stage2_status: "screening_complete",
    }).eq("id", applicationId)

    // FitScore narrative generation (Sonnet) — deferred, not blocking
    // await generateFitScoreNarrative(applicationId, components, total, affordabilityFlag)

    // Audit
    await supabase.from("audit_log").insert({
      org_id: application.org_id,
      table_name: "applications",
      record_id: applicationId,
      action: "UPDATE",
      new_values: { fitscore: total, searchworx_check_status: "complete" },
    })

    // Send credit report to applicant
    await sendCreditReportToApplicant(applicationId)

    // Send Email 7: Screening complete — agent notification
    try {
      const ctx = await buildEmailContext(applicationId)
      if (ctx) await sendScreeningComplete(ctx.appSummary, ctx.listingSummary, ctx.orgContext, { fitScore: total })
    } catch (e) { console.error("sendScreeningComplete failed:", e) }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[searchworx webhook] processing failed:", err)
    await supabase.from("applications").update({
      searchworx_check_status: "failed",
    }).eq("id", applicationId)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
