/**
 * app/api/admin/dev/searchworx-combined-real/route.ts — Dev verification route for Combined Consumer Credit Report
 *
 * Auth:   Admin HMAC token (enforced by proxy.ts)
 * Notes:  Accepts ?id_number=, optional ?org_id= and ?application_id=.
 *         Calls both Combined + VCCB against UAT and returns raw parsed shape as JSON.
 *         Empirically verifies credit/csi endpoint path — if that 404s, check COMBINED_PRODUCT_PATH.
 *         NOT for production use — admin/dev namespace only.
 */
import { type NextRequest, NextResponse } from "next/server"
import { runCombinedConsumerCreditReport } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { runVccbIncomeEstimator }          from "@/lib/searchworx/products/vccbIncomeEstimator"

const DEV_ORG_ID         = "00000000-0000-0000-0000-000000000000"
const DEV_APPLICATION_ID = "00000000-0000-0000-0000-000000000001"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const idNumber     = searchParams.get("id_number") ?? ""
  const orgId        = searchParams.get("org_id")        ?? DEV_ORG_ID
  const applicationId = searchParams.get("application_id") ?? DEV_APPLICATION_ID

  if (!idNumber) {
    return NextResponse.json({ error: "?id_number= is required" }, { status: 400 })
  }

  // Run sequentially so a thrown HTTP error from one doesn't mask the other.
  // searchworxCall throws for HTTP 4xx/5xx; { ok: false } is returned for API-level errors.
  let combinedOut: unknown
  let vccbOut: unknown

  try {
    const r = await runCombinedConsumerCreditReport({ orgId, applicationId, reference: `dev-${idNumber}`, idNumber })
    combinedOut = r.ok
      ? { ok: true, parsed: r.parsed, pdfStoragePath: r.pdfStoragePath, resultSummaryKey: r.resultSummaryKey }
      : { ok: false, error: r.error.message, category: r.error.category }
  } catch (err) {
    combinedOut = { ok: false, threw: true, error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const r = await runVccbIncomeEstimator({ orgId, applicationId, reference: `dev-${idNumber}`, idNumber })
    vccbOut = r.ok
      ? { ok: true, parsed: r.parsed, pdfStoragePath: r.pdfStoragePath, resultSummaryKey: r.resultSummaryKey }
      : { ok: false, error: r.error.message, category: r.error.category }
  } catch (err) {
    vccbOut = { ok: false, threw: true, error: err instanceof Error ? err.message : String(err) }
  }

  return NextResponse.json({ combined: combinedOut, vccb: vccbOut })
}
