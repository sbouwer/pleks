/**
 * app/api/applications/[id]/documents/route.ts — Bank statement extraction + pre-screen scoring
 *
 * Route:  POST /api/applications/[id]/documents
 * Auth:   applicant token bound to THIS application id (forwarded by the internal detect-document caller);
 *         validated BEFORE any mutation or AI call. Was previously UNGATED — an unauthenticated caller
 *         could trigger Sonnet extraction (denial-of-wallet), overwrite prescreen_*, and read the
 *         affordability signal for any known application id.
 * Data:   applications, listings, application-docs storage; Anthropic API via lib/ai/client.ts
 * Notes:  Sonnet income extraction gated behind ai_full (Portfolio+). Falls back to self-reported income.
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { verifyApplicantToken } from "@/lib/applications/verifyApplicantToken"
import { pathBelongsToApplication } from "@/lib/applications/applicationStoragePath"
import { checkAiRateLimit } from "@/lib/ai/rateLimit"
import { createMessage } from "@/lib/ai/client"
import { buildExtractionPrompt } from "@/lib/screening/bankStatementExtraction"
import { calculatePreScreenScore, getPreScreenIndicator } from "@/lib/screening/preScreenScore"
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: applicationId } = await params
  const supabase = await createServiceClient()
  const body = await req.json() as { bankStatementPath?: string; token?: string }
  const bankStatementPath = body.bankStatementPath

  // Auth: an applicant token bound to THIS application (forwarded by the internal detect-document caller).
  // Validate BEFORE any mutation/AI — nothing expensive or state-changing runs unauthenticated.
  if (!(await verifyApplicantToken(supabase, body.token, applicationId))) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  // Get application + listing (existence check BEFORE any mutation/AI).
  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, org_id, first_name, last_name, gross_monthly_income_cents, employment_type, listing_id, current_rent_cents, current_housing_status")
    .eq("id", applicationId)
    .single()
    logQueryError("POST applications", applicationError)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  // BIND the client-supplied path to THIS application's owned storage folder (using the DB org, not the path).
  // The token gate (#142) proves the caller owns the application, but bankStatementPath was still trusted straight
  // into the RLS-bypassing download() below — a token holder could pass another org's path and read cross-tenant
  // files. Reject a foreign/traversal path before any mutation or AI call. (hotfix 2026-07-07.)
  if (bankStatementPath && !pathBelongsToApplication(application.org_id as string, applicationId, bankStatementPath)) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 403 })
  }

  // Rate limit (denial-of-wallet): the Sonnet bank-statement extraction below is the expensive path — cap the
  // number of extractions per application per hour so a token holder can't run up the AI bill.
  if (bankStatementPath && !(await checkAiRateLimit(supabase, `doc-extract:${applicationId}`, 15, 60)).allowed) {
    return NextResponse.json({ error: "Too many extractions — please wait a moment and try again." }, { status: 429 })
  }

  // Mark as extracting (moved AFTER auth + existence — no unauthenticated state pollution).
  await supabase.from("applications").update({
    stage1_status: "extracting",
    bank_statement_status: "extracting",
  }).eq("id", applicationId)

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("asking_rent_cents")
    .eq("id", application.listing_id)
    .single()
    logQueryError("POST listings", listingError)

  let extractedIncome: number | null = null

  // Extract bank statement with Sonnet — only for Portfolio+ (ai_full)
  const tier = await getOrgTier(application.org_id)
  if (bankStatementPath && process.env.ANTHROPIC_API_KEY && hasFeature(tier, "ai_full")) {
    try {
      const { data: fileData, error: fileDataError } = await supabase.storage
        .from("application-docs")
        .download(bankStatementPath)
        logQueryError("POST application-docs", fileDataError)

      if (fileData) {
        const text = await fileData.text()
        const prompt = buildExtractionPrompt({
          declaredFirstName: application.first_name ?? "",
          declaredLastName: application.last_name ?? "",
          declaredMonthlyIncomeCents: application.gross_monthly_income_cents ?? null,
          currentRentCents: application.current_rent_cents ?? null,
          currentHousingStatus: application.current_housing_status ?? null,
        })
        const { message } = await createMessage(
          {
            model: "claude-sonnet-4-6-20250514",
            max_tokens: 2048,
            messages: [{
              role: "user",
              content: `${prompt}\n\nBank statement text:\n${text.slice(0, 15000)}`,
            }],
          },
          { orgId: application.org_id as string, purpose: "applicant_income_extraction" },
        )

        const responseText = message.content[0].type === "text" ? message.content[0].text : ""
        const jsonStart = responseText.indexOf("{")
        const jsonEnd = responseText.lastIndexOf("}")
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(responseText.slice(jsonStart, jsonEnd + 1))
          extractedIncome = parsed.avg_monthly_income_cents ?? null
        }
      }
    } catch {
      // Extraction failed — fall through to manual income
    }
  }

  // Use extracted income or self-reported income
  const incomeCents = extractedIncome ?? application.gross_monthly_income_cents ?? 0
  const rentCents = listing?.asking_rent_cents ?? 0

  const preScreen = calculatePreScreenScore(
    incomeCents,
    rentCents,
    application.employment_type,
    0 // no references at this stage
  )

  const ratio = incomeCents > 0 ? rentCents / incomeCents : null
  const indicator = getPreScreenIndicator(ratio)

  await supabase.from("applications").update({
    stage1_status: "pre_screen_complete",
    bank_statement_status: extractedIncome ? "extracted" : "manual",
    bank_statement_extracted: !!extractedIncome,
    prescreen_score: preScreen.prescreenScore,
    prescreen_income_score: preScreen.incomeScore,
    prescreen_employment_score: preScreen.employmentScore,
    prescreen_refs_score: preScreen.refsScore,
    prescreen_affordability_flag: indicator,
  }).eq("id", applicationId)

  return NextResponse.json({
    ok: true,
    status: "extraction_complete",
    prescreen_score: preScreen.prescreenScore,
    affordability_flag: indicator,
  })
}
