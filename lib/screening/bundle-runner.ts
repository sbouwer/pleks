/**
 * lib/screening/bundle-runner.ts — Standard screening bundle orchestrator
 *
 * Data:   application_screening_lines (insert); searchworx_rates via currentRates() for each line's cost estimate
 * Notes:  ADDENDUM_14H v3 §5. Called by the screening-line-runner cron for each ready_to_run line.
 *         Standard bundle = Combined Consumer Credit Report + VCCB Income Estimator.
 *         Foreign nationals: VCCB is skipped — no passport-based lookup available.
 *         ADDENDUM_14V §3.5/§3.6: each line's id is minted BEFORE its call and sent as the Searchworx Reference,
 *         so a billing-report row joins back to exactly one line; cost_cents is the current recorded rate
 *         (with rate_effective_date) until the billing reconcile in the rate sync overwrites it with the
 *         billed UnitPrice. No rate → cost_cents NULL plus a Sentry event — a paid screening still runs.
 *         The runner writes one application_screening_lines row per product_key.
 *         screeningRunId groups all products in a single run; re-screening creates a new run_id.
 *         Does NOT touch searchworx_check_status on applications/co-applicants — the cron owns that.
 *         Phase C: stores fitscore_bureau_scores + fitscore_vccb_income_gross_cents in
 *         searchworx_extracted_data JSONB on the subject row for the FitScore orchestrator.
 */
import { randomUUID }                             from "node:crypto"
import * as Sentry                                from "@sentry/nextjs"
import { createServiceClient }                    from "@/lib/supabase/server"
import { decrypt }                                from "@/lib/crypto/encryption"
import { SearchworxError } from "@/lib/searchworx/client"
import { runCombinedConsumerCreditReport, COMBINED_PRODUCT_KEY } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { runVccbIncomeEstimator, VCCB_PRODUCT_KEY, VCCB_RESULT_SUMMARIES } from "@/lib/searchworx/products/vccbIncomeEstimator"
import { extractBureauScores } from "@/lib/screening/searchworxBureauAdapter"
import { assertScreeningConsent, isApplicationSubject, screeningSubjectFor, type ScreeningSubjectType } from "@/lib/screening/consentGuard"
import { getSearchworxBundle } from "@/lib/screening/searchworxBundle"
import { currentRates, type CurrentRates } from "@/lib/searchworx/rates/read"
import { saTodayISO } from "@/lib/dates"
import type { SearchworxEnvelopeMeta } from "@/lib/searchworx/envelopeMeta"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BundleArgs {
  applicationId: string
  subjectType:   ScreeningSubjectType
  subjectId:     string
  orgId:         string
  screeningRunId?: string
  /**
   * Products already delivered in this run, not called again on a retry (14W §0c). A retry resumes the SAME run, so
   * the subject's report is one run, and a delivered product is never bought twice.
   */
  skipProducts?: readonly string[]
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

  const subjectTable = isApplicationSubject(subjectType) ? "applications" : "application_co_applicants"
  const subjectRowId = isApplicationSubject(subjectType) ? applicationId : subjectId

  // ── WHICH PRODUCTS RUN, AND WHAT THEY COST — asked of the SSOT, not re-derived here ──────────
  //
  // This file used to answer both questions itself: `isSaCitizen = idType === "sa_id"` decided the
  // VCCB line, and COMBINED_COST_CENTS / VCCB_COST_CENTS were charged straight into
  // application_screening_lines. searchworxBundle.ts answered the SAME two questions from
  // SEARCHWORX_BUNDLE_SA / _FOREIGN, and `bundle-economics.test.ts` asserts price > cost against
  // THAT answer. The two agreed only by coincidence of both having exactly two products: add a third
  // line to the SSOT and the margin guard would re-assert against a bundle this runner never runs,
  // staying green while describing a product that does not exist. Its own header records that
  // happening once already — "Nothing imported this file, so the drift was invisible."
  //
  // MEMBERSHIP still comes from that SSOT. COST no longer does (ADDENDUM_14V §3.6): it is the recorded
  // rate for the product on the day the line runs, the same table the fee was quoted from.
  const isForeignNational = idType !== "sa_id"
  const bundle = getSearchworxBundle(isForeignNational)
  const costOf = await lineCosts(bundle.map((c) => c.check_code), applicationId)

  // A product in the SSOT that this runner cannot run must FAIL, not be silently skipped. Without
  // this, adding a line item to SEARCHWORX_BUNDLE_SA changes the asserted margin and the applicant's
  // report says nothing about it — the failure is invisible in exactly the direction that costs money.
  const RUNNABLE = new Set([COMBINED_PRODUCT_KEY, VCCB_PRODUCT_KEY])
  const unrunnable = bundle.filter((c) => !RUNNABLE.has(c.check_code)).map((c) => c.check_code)
  if (unrunnable.length) {
    throw new Error(
      `Bundle contains product(s) this runner cannot execute: ${unrunnable.join(", ")}. ` +
      `Add a product module and wire it here, or the margin assertion in bundle-economics will ` +
      `describe a bundle that never runs.`,
    )
  }

  // The VCCB gate now follows bundle MEMBERSHIP rather than a second reading of id_type, so the
  // rate-card rule ("VCCB is SA-citizens only") is stated once, in the file that owns it.
  const runsVccb = bundle.some((c) => c.check_code === VCCB_PRODUCT_KEY)
  const skip = new Set(args.skipProducts ?? [])

  // ── Combined Consumer Credit Report (always, unless a retry already has it) ──
  const combinedResult = skip.has(COMBINED_PRODUCT_KEY)
    ? null
    : await runCombinedStep({ service, orgId, applicationId, subjectType, subjectId, subjectTable, subjectRowId, screeningRunId, idNumber, cost: costOf(COMBINED_PRODUCT_KEY) })

  // ── VCCB Income Estimator (SA citizens only) ────────────────────────────────
  const { vccbOk, vccbSummary } = skip.has(VCCB_PRODUCT_KEY)
    ? { vccbOk: true, vccbSummary: "delivered" }
    : await runVccbStep({
        service, orgId, applicationId, subjectType, subjectId,
        subjectTable, subjectRowId, screeningRunId, idNumber,
        runsVccb, vccbCost: costOf(VCCB_PRODUCT_KEY),
      })

  // ── Update applications.current_screening_run_id (the application's own subject only) ──
  if (isApplicationSubject(subjectType)) {
    const { error } = await service
      .from("applications")
      .update({ current_screening_run_id: screeningRunId })
      .eq("id", applicationId)
      .eq("org_id", orgId) // org-scope guard (caller-ID census)
    if (error) console.error("[bundle-runner] current_screening_run_id update failed:", error.message)
  }

  return {
    screeningRunId,
    combinedOk: combinedResult?.ok ?? true,
    vccbOk,
    combinedSummary: combinedResult?.summary ?? "delivered",
    vccbSummary,
  }
}

// ─── Combined step ────────────────────────────────────────────────────────────

interface CombinedStepArgs {
  service:        Awaited<ReturnType<typeof createServiceClient>>
  orgId:          string
  applicationId:  string
  subjectType:    ScreeningSubjectType
  subjectId:      string
  subjectTable:   "applications" | "application_co_applicants"
  subjectRowId:   string
  screeningRunId: string
  idNumber:       string
  cost:           LineCost
}

async function runCombinedStep(a: CombinedStepArgs): Promise<{ ok: boolean; summary: string }> {
  const { service, orgId, applicationId, subjectType, subjectId, subjectTable, subjectRowId, screeningRunId, idNumber } = a
  const combinedLineId = randomUUID()
  const combinedResult = await runCombinedConsumerCreditReport({
    orgId,
    applicationId,
    reference: combinedLineId,
    idNumber,
  }).catch((e: unknown) => transportFailure(e, COMBINED_PRODUCT_KEY, applicationId))

  const combinedSummary = combinedResult.ok ? combinedResult.resultSummaryKey : "failed"

  await upsertScreeningLine(service, {
    id:             combinedLineId,
    orgId,
    applicationId,
    subjectType,
    subjectId,
    screeningRunId,
    productKey:     COMBINED_PRODUCT_KEY,
    status:         combinedResult.ok ? "completed" : "failed",
    ...a.cost,
    pdfStoragePath: combinedResult.ok ? combinedResult.pdfStoragePath : null,
    resultSummary:  combinedSummary,
    searchToken:    combinedResult.ok ? combinedResult.parsed.searchToken : null,
    envelope:       combinedResult.envelope ?? null,
  })

  if (combinedResult.ok) {
    const bureauScores = extractBureauScores(combinedResult.parsed)
    await mergeExtractedData(service, subjectTable, subjectRowId, { fitscore_bureau_scores: bureauScores })
  }

  return { ok: combinedResult.ok, summary: combinedSummary }
}

// ─── VCCB step (extracted to reduce cognitive complexity) ─────────────────────

interface VccbStepArgs {
  service:        Awaited<ReturnType<typeof createServiceClient>>
  orgId:          string
  applicationId:  string
  subjectType:    ScreeningSubjectType
  subjectId:      string
  subjectTable:   "applications" | "application_co_applicants"
  subjectRowId:   string
  screeningRunId: string
  idNumber:       string
  runsVccb:       boolean
  vccbCost:       LineCost
}

async function runVccbStep(a: VccbStepArgs): Promise<{ vccbOk: boolean | "skipped"; vccbSummary: string }> {
  if (!a.runsVccb) {
    await upsertScreeningLine(a.service, {
      id:             randomUUID(),
      orgId:          a.orgId,
      applicationId:  a.applicationId,
      subjectType:    a.subjectType,
      subjectId:      a.subjectId,
      screeningRunId: a.screeningRunId,
      productKey:     VCCB_PRODUCT_KEY,
      status:         "skipped",
      costCents:      0,
      rateEffectiveDate: null,
      pdfStoragePath: null,
      resultSummary:  VCCB_RESULT_SUMMARIES.foreign_national_skip,
      searchToken:    null,
      envelope:       null,
    })
    return { vccbOk: "skipped", vccbSummary: VCCB_RESULT_SUMMARIES.foreign_national_skip }
  }

  const vccbLineId = randomUUID()
  const vccbResult = await runVccbIncomeEstimator({
    orgId:         a.orgId,
    applicationId: a.applicationId,
    reference:     vccbLineId,
    idNumber:      a.idNumber,
  }).catch((e: unknown) => transportFailure(e, VCCB_PRODUCT_KEY, a.applicationId))

  const vccbSummary = vccbResult.ok ? vccbResult.resultSummaryKey : "failed"

  await upsertScreeningLine(a.service, {
    id:             vccbLineId,
    orgId:          a.orgId,
    applicationId:  a.applicationId,
    subjectType:    a.subjectType,
    subjectId:      a.subjectId,
    screeningRunId: a.screeningRunId,
    productKey:     VCCB_PRODUCT_KEY,
    status:         vccbResult.ok ? "completed" : "failed",
    ...a.vccbCost,
    pdfStoragePath: vccbResult.ok ? vccbResult.pdfStoragePath : null,
    resultSummary:  vccbSummary,
    searchToken:    vccbResult.ok ? vccbResult.parsed.searchToken : null,
    envelope:       vccbResult.envelope ?? null,
  })

  if (vccbResult.ok) {
    await mergeExtractedData(a.service, a.subjectTable, a.subjectRowId, {
      fitscore_vccb_income_gross_cents: vccbResult.parsed.person.incomeGrossEstimateCents,
    })
  }

  return { vccbOk: vccbResult.ok, vccbSummary }
}

/**
 * A product call that THREW — timeout, non-2xx, network, token mint (searchworxCall) — is a failed attempt like any
 * other, recorded as a `failed` line so the bounded retry counts it (14W §0c, walker 14w-s0c F1). Left to propagate,
 * a bureau outage — the exact case the retry exists for — marked the subject `failed` for good, with no retry and no
 * refund. Data defects (no ID number, no consent) still throw: they are raised before any call, outside this wrapper.
 */
function transportFailure(e: unknown, productKey: string, applicationId: string): { ok: false; error: SearchworxError; envelope?: undefined } {
  Sentry.captureException(e, { tags: { area: "screening-product-call", product_key: productKey }, extra: { applicationId } })
  const message = e instanceof Error ? e.message : "unknown transport error"
  return { ok: false, error: new SearchworxError(`Searchworx transport: ${message}`, "vendor_unavailable", message) }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function fetchSubjectCredentials(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  subjectType: ScreeningSubjectType,
  subjectId: string,
): Promise<{ idNumberEncrypted: string | null; idType: string | null }> {
  if (isApplicationSubject(subjectType)) {
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

type LineCost = { costCents: number | null; rateEffectiveDate: string | null }

/**
 * The recorded rate per product for lines run today. A read failure or a missing rate records NULL — never a
 * literal — and raises Sentry; the screening was paid for and still runs.
 */
async function lineCosts(productKeys: string[], applicationId: string): Promise<(productKey: string) => LineCost> {
  let read: CurrentRates | null = null
  try {
    read = await currentRates(productKeys, saTodayISO())
  } catch (e) {
    Sentry.captureException(e, { tags: { area: "screening-line-cost" }, extra: { applicationId } })
  }
  if (read && read.missing.length > 0) {
    Sentry.captureMessage("Screening line run with no recorded rate — cost_cents left NULL", {
      level: "error",
      tags: { area: "screening-line-cost" },
      extra: { applicationId, missing: read.missing },
    })
  }
  return (productKey) => {
    const r = read?.rates.get(productKey)
    return r ? { costCents: r.costExclVatCents, rateEffectiveDate: r.effectiveDate } : { costCents: null, rateEffectiveDate: null }
  }
}

interface ScreeningLinePayload {
  /** Minted before the call and sent as its Searchworx Reference — the billing reconcile joins on it. */
  id:             string
  orgId:          string
  applicationId:  string
  subjectType:    ScreeningSubjectType
  subjectId:      string
  screeningRunId: string
  productKey:     string
  status:         string
  costCents:      number | null
  rateEffectiveDate: string | null
  pdfStoragePath: string | null
  resultSummary:  string
  searchToken:    string | null
  /** PII-free envelope metadata (ADDENDUM_14V §3.2a); null when no call was made or it threw before a response. */
  envelope:       SearchworxEnvelopeMeta | null
}

async function upsertScreeningLine(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  p: ScreeningLinePayload,
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await service
    .from("application_screening_lines")
    .insert({
      id:                      p.id,
      org_id:                  p.orgId,
      application_id:          p.applicationId,
      subject_type:            p.subjectType,
      subject_id:              p.subjectId,
      screening_run_id:        p.screeningRunId,
      product_key:             p.productKey,
      status:                  p.status,
      cost_cents:              p.costCents,
      rate_effective_date:     p.rateEffectiveDate,
      pdf_storage_path:        p.pdfStoragePath || null,
      result_summary:          p.resultSummary,
      searchworx_search_token: p.searchToken || null,
      searchworx_envelope_meta: p.envelope,
      started_at:              now,
      completed_at:            now,
    })
  // THROWS (walker 14w-s0c F2). The lines ARE the retry's attempt counter: a swallowed insert leaves the count
  // unchanged, so the run plans `retry` every tick forever, re-billing the product — or re-buying one that was
  // delivered but whose `completed` row was lost. A throw fails the subject terminally instead: bounded, and loud.
  if (error) throw new Error(`screening line insert failed (${p.productKey}): ${error.message}`)
}
