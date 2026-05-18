/**
 * lib/screening/bundle-runner.ts — Standard screening bundle orchestrator
 *
 * Notes:  ADDENDUM_14H v3 §5. Called by the screening-line-runner cron for each ready_to_run line.
 *         Standard bundle = Combined Consumer Credit Report (R170) + VCCB Income Estimator (R6.35).
 *         Foreign nationals: VCCB is skipped — no passport-based lookup available.
 *         The runner writes one application_screening_lines row per product_key.
 *         screeningRunId groups all products in a single run; re-screening creates a new run_id.
 *         Does NOT touch searchworx_check_status on applications/co-applicants — the cron owns that.
 */
import { randomUUID }                             from "crypto"
import { createServiceClient }                    from "@/lib/supabase/server"
import { decrypt }                                from "@/lib/crypto/encryption"
import { runCombinedConsumerCreditReport, COMBINED_PRODUCT_KEY, COMBINED_COST_CENTS } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { runVccbIncomeEstimator, VCCB_PRODUCT_KEY, VCCB_COST_CENTS, VCCB_RESULT_SUMMARIES } from "@/lib/searchworx/products/vccbIncomeEstimator"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BundleArgs {
  applicationId: string
  subjectType:   "company" | "co_applicant"
  subjectId:     string
  orgId:         string
  screeningRunId?: string
}

export interface BundleResult {
  screeningRunId:    string
  combinedOk:        boolean
  vccbOk:            boolean | "skipped"
  combinedSummary:   string
  vccbSummary:       string
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runStandardBundle(args: BundleArgs): Promise<BundleResult> {
  const { applicationId, subjectType, subjectId, orgId } = args
  const screeningRunId = args.screeningRunId ?? randomUUID()
  const service        = await createServiceClient()

  // ── Fetch subject data ──────────────────────────────────────────────────────
  const { idNumberEncrypted, idType } = await fetchSubjectCredentials(service, subjectType, subjectId)
  const idNumber = idNumberEncrypted ? decrypt(idNumberEncrypted) : null

  if (!idNumber) {
    throw new Error(`No ID number on record for subject ${subjectId} (${subjectType})`)
  }

  const reference = `${applicationId}-${screeningRunId.slice(0, 8)}`
  const isSaCitizen = idType === "sa_id"

  // ── Run Combined Consumer Credit Report (always) ────────────────────────────
  const combinedResult = await runCombinedConsumerCreditReport({
    orgId,
    applicationId,
    reference,
    idNumber,
  })

  const combinedSummary = combinedResult.ok
    ? combinedResult.resultSummaryKey
    : "failed"

  await upsertScreeningLine(service, {
    orgId,
    applicationId,
    subjectType,
    subjectId,
    screeningRunId,
    productKey:         COMBINED_PRODUCT_KEY,
    status:             combinedResult.ok ? "completed" : "failed",
    costCents:          COMBINED_COST_CENTS,
    pdfStoragePath:     combinedResult.ok ? combinedResult.pdfStoragePath : null,
    resultSummary:      combinedSummary,
    searchToken:        combinedResult.ok ? combinedResult.parsed.searchToken : null,
  })

  // ── VCCB Income Estimator (SA citizens only) ────────────────────────────────
  let vccbOk: boolean | "skipped"
  let vccbSummary: string

  if (!isSaCitizen) {
    vccbOk      = "skipped"
    vccbSummary = VCCB_RESULT_SUMMARIES.foreign_national_skip

    await upsertScreeningLine(service, {
      orgId,
      applicationId,
      subjectType,
      subjectId,
      screeningRunId,
      productKey:     VCCB_PRODUCT_KEY,
      status:         "skipped",
      costCents:      0,
      pdfStoragePath: null,
      resultSummary:  vccbSummary,
      searchToken:    null,
    })
  } else {
    const vccbResult = await runVccbIncomeEstimator({
      orgId,
      applicationId,
      reference,
      idNumber,
    })

    vccbOk      = vccbResult.ok
    vccbSummary = vccbResult.ok ? vccbResult.resultSummaryKey : "failed"

    await upsertScreeningLine(service, {
      orgId,
      applicationId,
      subjectType,
      subjectId,
      screeningRunId,
      productKey:         VCCB_PRODUCT_KEY,
      status:             vccbResult.ok ? "completed" : "failed",
      costCents:          VCCB_COST_CENTS,
      pdfStoragePath:     vccbResult.ok ? vccbResult.pdfStoragePath : null,
      resultSummary:      vccbSummary,
      searchToken:        vccbResult.ok ? vccbResult.parsed.searchToken : null,
    })
  }

  // ── Update applications.current_screening_run_id (primary applicant only) ──
  if (subjectType === "company") {
    const { error } = await service
      .from("applications")
      .update({ current_screening_run_id: screeningRunId })
      .eq("id", applicationId)
    if (error) console.error("[bundle-runner] current_screening_run_id update failed:", error.message)
  }

  return { screeningRunId, combinedOk: combinedResult.ok, vccbOk, combinedSummary, vccbSummary }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function fetchSubjectCredentials(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  subjectType: "company" | "co_applicant",
  subjectId: string,
): Promise<{ idNumberEncrypted: string | null; idType: string | null }> {
  if (subjectType === "company") {
    const { data, error } = await service
      .from("applications")
      .select("id_number, id_type")
      .eq("id", subjectId)
      .single()
    if (error) throw new Error(`fetch application credentials: ${error.message}`)
    return { idNumberEncrypted: data?.id_number ?? null, idType: data?.id_type ?? null }
  }

  const { data, error } = await service
    .from("application_co_applicants")
    .select("id_number, id_type")
    .eq("id", subjectId)
    .single()
  if (error) throw new Error(`fetch co-applicant credentials: ${error.message}`)
  return { idNumberEncrypted: data?.id_number ?? null, idType: data?.id_type ?? null }
}

interface ScreeningLinePayload {
  orgId:          string
  applicationId:  string
  subjectType:    "company" | "co_applicant"
  subjectId:      string
  screeningRunId: string
  productKey:     string
  status:         string
  costCents:      number
  pdfStoragePath: string | null
  resultSummary:  string
  searchToken:    string | null
}

async function upsertScreeningLine(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  p: ScreeningLinePayload,
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await service
    .from("application_screening_lines")
    .insert({
      org_id:                  p.orgId,
      application_id:          p.applicationId,
      subject_type:            p.subjectType,
      subject_id:              p.subjectId,
      screening_run_id:        p.screeningRunId,
      product_key:             p.productKey,
      status:                  p.status,
      cost_cents:              p.costCents,
      pdf_storage_path:        p.pdfStoragePath || null,
      result_summary:          p.resultSummary,
      searchworx_search_token: p.searchToken || null,
      started_at:              now,
      completed_at:            now,
    })
  if (error) console.error(`[bundle-runner] upsert screening_line ${p.productKey}:`, error.message)
}
