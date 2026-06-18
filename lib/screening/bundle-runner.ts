/**
 * lib/screening/bundle-runner.ts — Standard screening bundle orchestrator
 *
 * Notes:  ADDENDUM_14H v3 §5. Called by the screening-line-runner cron for each ready_to_run line.
 *         Standard bundle = Combined Consumer Credit Report (R170) + VCCB Income Estimator (R6.35).
 *         Foreign nationals: VCCB is skipped — no passport-based lookup available.
 *         The runner writes one application_screening_lines row per product_key.
 *         screeningRunId groups all products in a single run; re-screening creates a new run_id.
 *         Does NOT touch searchworx_check_status on applications/co-applicants — the cron owns that.
 *         Phase C: stores fitscore_bureau_scores + fitscore_vccb_income_gross_cents in
 *         searchworx_extracted_data JSONB on the subject row for the FitScore orchestrator.
 */
import { randomUUID }                             from "node:crypto"
import { createServiceClient }                    from "@/lib/supabase/server"
import { decrypt }                                from "@/lib/crypto/encryption"
import { runCombinedConsumerCreditReport, COMBINED_PRODUCT_KEY, COMBINED_COST_CENTS } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { runVccbIncomeEstimator, VCCB_PRODUCT_KEY, VCCB_COST_CENTS, VCCB_RESULT_SUMMARIES } from "@/lib/searchworx/products/vccbIncomeEstimator"
import { extractBureauScores } from "@/lib/screening/searchworxBureauAdapter"
import { assertScreeningConsent, screeningSubjectFor } from "@/lib/screening/consentGuard"

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

  // POPIA s11 / BUILD_69 P3: no Searchworx run without recorded consent. Belt over the ready_to_run
  // view-gate — this entrypoint re-asserts so any future non-cron caller can't bypass it.
  await assertScreeningConsent(service, screeningSubjectFor(subjectType, subjectId))

  // ── Fetch subject data ──────────────────────────────────────────────────────
  const { idNumberEncrypted, idType } = await fetchSubjectCredentials(service, subjectType, subjectId)
  const idNumber = idNumberEncrypted ? decrypt(idNumberEncrypted) : null

  if (!idNumber) {
    throw new Error(`No ID number on record for subject ${subjectId} (${subjectType})`)
  }

  const reference  = `${applicationId}-${screeningRunId.slice(0, 8)}`
  const isSaCitizen = idType === "sa_id"
  const subjectTable = subjectType === "company" ? "applications" : "application_co_applicants"
  const subjectRowId = subjectType === "company" ? applicationId : subjectId

  // ── Run Combined Consumer Credit Report (always) ────────────────────────────
  const combinedResult = await runCombinedConsumerCreditReport({
    orgId,
    applicationId,
    reference,
    idNumber,
  })

  const combinedSummary = combinedResult.ok ? combinedResult.resultSummaryKey : "failed"

  await upsertScreeningLine(service, {
    orgId,
    applicationId,
    subjectType,
    subjectId,
    screeningRunId,
    productKey:     COMBINED_PRODUCT_KEY,
    status:         combinedResult.ok ? "completed" : "failed",
    costCents:      COMBINED_COST_CENTS,
    pdfStoragePath: combinedResult.ok ? combinedResult.pdfStoragePath : null,
    resultSummary:  combinedSummary,
    searchToken:    combinedResult.ok ? combinedResult.parsed.searchToken : null,
  })

  if (combinedResult.ok) {
    const bureauScores = extractBureauScores(combinedResult.parsed)
    await mergeExtractedData(service, subjectTable, subjectRowId, { fitscore_bureau_scores: bureauScores })
  }

  // ── VCCB Income Estimator (SA citizens only) ────────────────────────────────
  const { vccbOk, vccbSummary } = await runVccbStep({
    service, orgId, applicationId, subjectType, subjectId,
    subjectTable, subjectRowId, screeningRunId, reference, idNumber, isSaCitizen,
  })

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

// ─── VCCB step (extracted to reduce cognitive complexity) ─────────────────────

interface VccbStepArgs {
  service:        Awaited<ReturnType<typeof createServiceClient>>
  orgId:          string
  applicationId:  string
  subjectType:    "company" | "co_applicant"
  subjectId:      string
  subjectTable:   "applications" | "application_co_applicants"
  subjectRowId:   string
  screeningRunId: string
  reference:      string
  idNumber:       string
  isSaCitizen:    boolean
}

async function runVccbStep(a: VccbStepArgs): Promise<{ vccbOk: boolean | "skipped"; vccbSummary: string }> {
  if (!a.isSaCitizen) {
    await upsertScreeningLine(a.service, {
      orgId:          a.orgId,
      applicationId:  a.applicationId,
      subjectType:    a.subjectType,
      subjectId:      a.subjectId,
      screeningRunId: a.screeningRunId,
      productKey:     VCCB_PRODUCT_KEY,
      status:         "skipped",
      costCents:      0,
      pdfStoragePath: null,
      resultSummary:  VCCB_RESULT_SUMMARIES.foreign_national_skip,
      searchToken:    null,
    })
    return { vccbOk: "skipped", vccbSummary: VCCB_RESULT_SUMMARIES.foreign_national_skip }
  }

  const vccbResult = await runVccbIncomeEstimator({
    orgId:         a.orgId,
    applicationId: a.applicationId,
    reference:     a.reference,
    idNumber:      a.idNumber,
  })

  const vccbSummary = vccbResult.ok ? vccbResult.resultSummaryKey : "failed"

  await upsertScreeningLine(a.service, {
    orgId:          a.orgId,
    applicationId:  a.applicationId,
    subjectType:    a.subjectType,
    subjectId:      a.subjectId,
    screeningRunId: a.screeningRunId,
    productKey:     VCCB_PRODUCT_KEY,
    status:         vccbResult.ok ? "completed" : "failed",
    costCents:      VCCB_COST_CENTS,
    pdfStoragePath: vccbResult.ok ? vccbResult.pdfStoragePath : null,
    resultSummary:  vccbSummary,
    searchToken:    vccbResult.ok ? vccbResult.parsed.searchToken : null,
  })

  if (vccbResult.ok) {
    await mergeExtractedData(a.service, a.subjectTable, a.subjectRowId, {
      fitscore_vccb_income_gross_cents: vccbResult.parsed.person.incomeGrossEstimateCents,
    })
  }

  return { vccbOk: vccbResult.ok, vccbSummary }
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

async function mergeExtractedData(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  table: "applications" | "application_co_applicants",
  id: string,
  patches: Record<string, unknown>,
): Promise<void> {
  const { data, error: readErr } = await service
    .from(table)
    .select("searchworx_extracted_data")
    .eq("id", id)
    .single()
  if (readErr) {
    console.error(`[bundle-runner] read searchworx_extracted_data (${table}):`, readErr.message)
    return
  }
  const merged = Object.assign({}, data?.searchworx_extracted_data, patches)
  const { error: writeErr } = await service
    .from(table)
    .update({ searchworx_extracted_data: merged })
    .eq("id", id)
  if (writeErr) {
    console.error(`[bundle-runner] write searchworx_extracted_data (${table}):`, writeErr.message)
  }
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
