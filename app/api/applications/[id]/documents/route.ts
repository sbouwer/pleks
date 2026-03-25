import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"
import { INCOME_EXTRACTION_PROMPT } from "@/lib/screening/bankStatementExtraction"
import { calculatePreScreenScore, getPreScreenIndicator } from "@/lib/screening/preScreenScore"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: applicationId } = await params
  const supabase = await createServiceClient()
  const body = await req.json()
  const bankStatementPath = body.bankStatementPath as string | undefined

  // Mark as extracting
  await supabase.from("applications").update({
    stage1_status: "extracting",
    bank_statement_status: "extracting",
  }).eq("id", applicationId)

  // Get application + listing
  const { data: application } = await supabase
    .from("applications")
    .select("id, org_id, gross_monthly_income_cents, employment_type, listing_id")
    .eq("id", applicationId)
    .single()

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("asking_rent_cents")
    .eq("id", application.listing_id)
    .single()

  let extractedIncome: number | null = null

  // Extract bank statement with Sonnet if available
  if (bankStatementPath && process.env.ANTHROPIC_API_KEY) {
    try {
      const { data: fileData } = await supabase.storage
        .from("application-docs")
        .download(bankStatementPath)

      if (fileData) {
        const text = await fileData.text()
        const anthropic = new Anthropic()
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-6-20250514",
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: `${INCOME_EXTRACTION_PROMPT}\n\nBank statement text:\n${text.slice(0, 15000)}`,
          }],
        })

        const responseText = message.content[0].type === "text" ? message.content[0].text : ""
        const jsonMatch = /\{[\s\S]*\}/.exec(responseText)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
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
