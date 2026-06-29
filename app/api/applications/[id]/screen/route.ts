/**
 * app/api/applications/[id]/screen/route.ts — async pre-screen pass (ADDENDUM_14M; production-wires 14L).
 *
 * Route:  POST /api/applications/[id]/screen  (run one screening pass) · GET ?token= (poll status)
 * Auth:   PUBLIC / UNAUTHENTICATED by design — the apply flow has no session. The application_tokens row
 *         (bound to THIS [id] — IDOR guard) is the capability. Rate-limited per IP. org_id is read from the
 *         application server-side. Consent (applications.stage1_consent_given, recorded at submit) is a hard
 *         precondition — we never read financial documents without it.
 * Data:   downloads application-docs from Storage → runPipeline (14L, gated on the org's ai_full tier) →
 *         deterministic 14M evaluateRuling → a versioned application_screening_evaluations row; drives a
 *         durable screening_jobs row (immediate fire + cron retry). input_snapshot is PII-SAFE (amounts /
 *         keys / periods / verdicts only — never raw name/ID).
 * Notes:  heavy (10–60s of AI) — must NOT run inside the submit request; fired async + swept by cron.
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { runPipeline } from "@/lib/extraction/pipeline"
import { reconcile } from "@/lib/extraction/reconciler"
import { slotTypeForFilename } from "@/lib/extraction/slotType"
import { evaluateRuling } from "@/lib/applications/ruling"
import { companyOptionFrom } from "@/lib/applications/assembleAssessment"
import { decryptIdNumber } from "@/lib/crypto/idNumber"
import { getApplicationDocumentSubjects } from "@/lib/applications/documentRegistry"
import { resolvePoolingRule } from "@/lib/screening/screeningPolicy"
import { evaluateCompanyRuling, type CompanyVerdict, type DirectorSurety } from "@/lib/applications/companyRuling"
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { RECONCILER_VERSION, type DeclaredContext, type Document, type ReconciliationResult, type PipelineDocumentResult } from "@/lib/extraction/types"
import { MAX_SCREENING_ITERATIONS } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

type Db = Awaited<ReturnType<typeof createServiceClient>>
const BUCKET = "application-docs"

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  return "application/octet-stream"
}

/** Enumerate + download every uploaded doc for the application — REGISTRY-DRIVEN (14P 0b.5): each registered doc
 *  is downloaded wherever it lives (root for the primary, co_{id}/ subfolder for a director — subfolders isolate a
 *  co's bank_main from the primary's, fixing the flat-path collision) with its registry subjectRef. A storage-
 *  complete fallback also loads any ROOT file NOT in the registry as 'primary' (legacy/unregistered). Drift (a
 *  registry row whose object is missing, or an unregistered file) is logged, never silently skipped (§3). */
async function loadDocuments(db: Db, orgId: string, appId: string): Promise<Document[]> {
  const prefix = `applications/${orgId}/${appId}`
  const subjects = await getApplicationDocumentSubjects(db, appId) // storage_path → subject_ref (authoritative)
  const docs: Document[] = []
  const seen = new Set<string>()
  let missing = 0
  // 1. Registered docs (root OR co_{id}/ subfolder) — registry attribution.
  for (const [path, subjectRef] of subjects) {
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(path)
    if (dlErr || !blob) { missing++; continue }
    const filename = path.split("/").pop() ?? path
    docs.push({ path, filename, bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: mimeFromName(filename), slotType: slotTypeForFilename(filename), subjectRef })
    seen.add(path)
  }
  // 2. Storage-complete fallback for UNregistered files (registration failed) — never silently dropped (§3). A root
  //    file → 'primary'; a file inside a co_{id}/ subfolder → that subject (path-derived), so a registration-failed
  //    co-doc is still analysed + attributed correctly, and counted as drift.
  const { data: files, error } = await db.storage.from(BUCKET).list(prefix)
  logQueryError("screen storage.list", error)
  let unregistered = 0
  const addUnregistered = async (path: string, filename: string, subjectRef: string) => {
    if (seen.has(path)) return
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(path)
    if (dlErr || !blob) { logQueryError("screen storage.download", dlErr); return }
    docs.push({ path, filename, bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: mimeFromName(filename), slotType: slotTypeForFilename(filename), subjectRef })
    unregistered++
  }
  for (const f of files ?? []) {
    if (!f.name || f.name.startsWith(".")) continue
    if (f.id === null) {
      // A subject subfolder (co_{id}/) — list it; any file not in the registry is attributed by the folder name.
      if (!f.name.startsWith("co_")) continue
      const { data: subFiles, error: subErr } = await db.storage.from(BUCKET).list(`${prefix}/${f.name}`)
      logQueryError("screen storage.list (co subfolder)", subErr)
      for (const sf of subFiles ?? []) {
        if (!sf.name || sf.name.startsWith(".") || sf.id === null) continue
        await addUnregistered(`${prefix}/${f.name}/${sf.name}`, sf.name, f.name)
      }
      continue
    }
    await addUnregistered(`${prefix}/${f.name}`, f.name, "primary")
  }
  if (missing > 0 || unregistered > 0) console.warn(`[screen] ${appId}: ${missing} registry row(s) with a missing object, ${unregistered} unregistered file(s) loaded by path-derived subject (14P §3 drift).`)
  return docs
}

/** The company's surety-director SET (14P 0b.3): the primary (lead) + each co-applicant standing surety. Each
 *  director reconciles against ITS OWN declared income + docs (per-subject), scoped to adults:1 (§5.4 — co-directors
 *  are separate households). A director with no docs reconciles declared-only → not credited (strict model, flag 97);
 *  the engine pools only the VERIFIED residuals under the dispositive rule + the execution gate. */
async function loadCompanyDirectorSet(
  db: Db, appId: string, appliedRentCents: number, now: Date,
  reconcileSubject: (ref: string, declaredCtx: DeclaredContext) => ReconciliationResult,
  primaryDirector: DirectorSurety,
): Promise<DirectorSurety[]> {
  const { data: cos, error } = await db
    .from("application_co_applicants")
    .select("id, first_name, last_name, id_number, gross_monthly_income_cents, employment_type, section_data, stage1_consent_given")
    .eq("primary_application_id", appId).eq("is_surety_director", true)
  logQueryError("screen co-directors", error)
  const directors: DirectorSurety[] = [primaryDirector]
  for (const c of cos ?? []) {
    const sd = (c.section_data ?? {}) as {
      income_sources?: Array<{ key: string; label: string; monthly_cents?: number }>
      employment_details?: { start_date?: string | null }
      dependants?: { adults?: number | null; minors?: number | null; school_fees?: number | null }
    }
    const declared: DeclaredContext = {
      appliedRentCents,
      applicant: { fullName: [c.first_name, c.last_name].filter(Boolean).join(" ") || undefined, idNumber: decryptIdNumber(c.id_number as string | null) ?? undefined },
      incomeSources: (sd.income_sources ?? []).map((s) => ({ key: s.key, label: s.label, monthly_cents: s.monthly_cents ?? 0 })),
    }
    directors.push({
      ref: `co_${c.id}`,
      input: {
        appliedRentCents,
        declaredMonthlyIncomeCents: (c.gross_monthly_income_cents as number | null) ?? 0,
        employmentType: (c.employment_type as string | null) ?? null,
        employmentStartDate: sd.employment_details?.start_date ?? null,
        reconciliation: reconcileSubject(`co_${c.id}`, declared),
        now,
        adults: 1,                                       // §5.4 — each director is their own household
        adultDependents: sd.dependants?.adults ?? 0,
        minorDependents: sd.dependants?.minors ?? 0,
        schoolFeesCents: Math.round((sd.dependants?.school_fees ?? 0) * 100),
        childMaintenanceCents: 0,
      },
      suretyState: "intended",                           // pre-execution at deep-scan time (signed at BUILD_69)
      suretyGroup: null,                                 // no surety_group column today → each director is its own group
      consented: c.stage1_consent_given === true,
    })
  }
  return directors
}

interface AppRow {
  org_id: string; listing_id: string; co_applicants_count: number | null; dependents_count: number | null
  dependent_adults_count: number | null; dependent_minors_count: number | null; school_fees_cents: number | null
  first_name: string | null; last_name: string | null; id_number: string | null
  gross_monthly_income_cents: number | null; employment_type: string | null; employment_start_date: string | null
  income_sources: Array<{ key: string; label: string; monthly_cents: number }> | null
  stage1_consent_given: boolean | null
}

function buildDeclared(app: AppRow, appliedRentCents: number): DeclaredContext {
  return {
    appliedRentCents,
    applicant: { fullName: [app.first_name, app.last_name].filter(Boolean).join(" ") || undefined, idNumber: decryptIdNumber(app.id_number as string | null) ?? undefined },
    incomeSources: (app.income_sources ?? []).map((s) => ({ key: s.key, label: s.label, monthly_cents: s.monthly_cents })),
  }
}

/** Atomically claim the newest pending/failed job (fix #5: conditional UPDATE, not SELECT-then-UPDATE). */
async function claimJob(db: Db, appId: string): Promise<{ id: string; attempts: number } | null> {
  const { data: job, error: jobErr } = await db.from("screening_jobs")
    .select("id, attempts, max_attempts")
    .eq("application_id", appId).in("status", ["pending", "failed"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("screen claimJob select", jobErr)
  if (!job) return null
  if (job.attempts >= job.max_attempts) {
    await db.from("screening_jobs").update({ status: "failed", error: "max attempts reached", updated_at: new Date().toISOString() }).eq("id", job.id)
    return null
  }
  const { data: claimed, error: claimErr } = await db.from("screening_jobs")
    .update({ status: "running", attempts: job.attempts + 1, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", job.id).in("status", ["pending", "failed"])   // row-lock re-check → only one concurrent claimer wins
    .select("id").maybeSingle()
  logQueryError("screen claimJob update", claimErr)
  return claimed ? { id: job.id, attempts: job.attempts + 1 } : null
}

async function tokenAppId(db: Db, token: string, id: string): Promise<boolean> {
  const { data, error } = await db.from("application_tokens")
    .select("application_id").eq("token", token).eq("application_id", id)   // IDOR: bound to THIS id (fix #6)
    .gt("expires_at", new Date().toISOString()).maybeSingle()
  logQueryError("screen tokenAppId", error)
  return !!data
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`screen:${getClientIp(req)}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { token?: string }
  const db = await createServiceClient()

  if (!body.token || !(await tokenAppId(db, body.token, id))) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  const { data: app, error: appErr } = await db
    .from("applications")
    .select("org_id, listing_id, co_applicants_count, dependents_count, dependent_adults_count, dependent_minors_count, school_fees_cents, first_name, last_name, id_number, gross_monthly_income_cents, employment_type, employment_start_date, income_sources, stage1_consent_given, applicant_type, company_info, free_assessment, listings(asking_rent_cents, units(properties(type)))")
    .eq("id", id).single()
  logQueryError("screen applications", appErr)
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Consent is a hard precondition — never read financial documents without it (fix #3).
  if (app.stage1_consent_given !== true) return NextResponse.json({ error: "Consent not recorded" }, { status: 403 })

  const claim = await claimJob(db, id)
  if (!claim) return NextResponse.json({ ok: true, status: "already-claimed" })   // idempotent vs double-fire/cron

  try {
    // Hard cap (defensive — also enforced at submit): never exceed MAX_SCREENING_ITERATIONS evaluations.
    // Checked BEFORE the pipeline so a capped re-fire wastes no Sonnet calls.
    const { count: evalCount, error: evalCountErr } = await db.from("application_screening_evaluations").select("id", { count: "exact", head: true }).eq("application_id", id)
    logQueryError("screen eval cap count", evalCountErr)
    if ((evalCount ?? 0) >= MAX_SCREENING_ITERATIONS) {
      await db.from("screening_jobs").update({ status: "done", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", claim.id)
      return NextResponse.json({ ok: true, status: "cap-reached" })
    }

    const listing = app.listings as { asking_rent_cents?: number; units?: { properties?: { type?: string } } } | null
    const appliedRentCents = listing?.asking_rent_cents ?? 0
    const unitType = listing?.units?.properties?.type === "commercial" ? "commercial" as const : "residential" as const
    const applicantCount = (app.co_applicants_count ?? 0) + 1
    const declared = buildDeclared(app as unknown as AppRow, appliedRentCents)

    // Tier gate: full AI extraction for ai_full orgs with docs; else declared-only reconciliation (graceful
    // degrade — confidence will be 'needs-evidence' with upload prompts; no AI cost).
    // CANONICAL tier (service-client, DB-authoritative) — NOT getOrgTier: the screen route runs in the applicant's
    // token context with no agent cookie/membership, so getOrgTier's cookie-client fallback returns "owner" and
    // silently skips AI extraction even for paid orgs. Capability gates must use the canonical tier.
    const tier = await getOrgTierCanonical(app.org_id)
    let extracted: PipelineDocumentResult[] = []
    let fraudSignals: unknown[] = []
    const docs = await loadDocuments(db, app.org_id, id)
    if (hasFeature(tier, "ai_full") && docs.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const result = await runPipeline(
        { unitType, applicantCount, documents: docs, declared, metadata: { source: "production", orgId: app.org_id, applicationId: id } },
        { orgId: app.org_id, suppressLogging: false, harnessMode: false },
      )
      extracted = result.documents
      fraudSignals = result.fraudSignals
    }

    // 14P 0b.3 — per-subject reconcile: partition the extracted docs by subjectRef (registry attribution) and
    // reconcile each subject against ITS OWN declared income. A director who has uploaded docs (0b.5, co_{id}/
    // subfolder) reconciles against them → corroborated → credited; one with no docs reconciles declared-only
    // (corroboratedIncome 0 → not credited → flag 97). The reconciler ALGORITHM is unchanged (RECONCILER_VERSION
    // stable); the orchestration is captured by the 0b company-ruling version in ruling_version (§4).
    const now = new Date()
    const subjectOf = new Map(docs.map((d) => [d.path, d.subjectRef ?? "primary"]))
    const reconcileSubject = (ref: string, declaredCtx: DeclaredContext): ReconciliationResult =>
      reconcile(extracted.filter((r) => (subjectOf.get(r.path) ?? "primary") === ref), declaredCtx, now)
    const reconciliation = reconcileSubject("primary", declared)

    const personalInput = {
      appliedRentCents,
      declaredMonthlyIncomeCents: app.gross_monthly_income_cents ?? 0,
      employmentType: app.employment_type,
      employmentStartDate: app.employment_start_date,
      reconciliation,
      now,
      adults: applicantCount,                          // earner adults (applicant + co-applicants)
      adultDependents: (app as unknown as AppRow).dependent_adults_count ?? 0,
      minorDependents: (app as unknown as AppRow).dependent_minors_count ?? (app as unknown as AppRow).dependents_count ?? 0,
      schoolFeesCents: (app as unknown as AppRow).school_fees_cents ?? 0,
      // Child maintenance received — excluded from rent-payable income, offsets the child bucket (floor + fees).
      childMaintenanceCents: ((app as unknown as AppRow).income_sources ?? []).filter((s) => s.key === "maintenance").reduce((sum, s) => sum + (s.monthly_cents ?? 0), 0),
    }

    // ADDENDUM_14O/14P: a JURISTIC company applies through its directors — the deep scan rules on the company
    // (declared signals) + the directors' VERIFIED surety POOL, NOT the director's personal tenancy. companyOptionFrom
    // returns null for non-juristic → the personal path is unchanged. Each director is scoped to adults:1 (§5.4).
    const companyOption = companyOptionFrom((app as unknown as { company_info?: Record<string, unknown> | null }).company_info, (app as unknown as { applicant_type?: string | null }).applicant_type)
    let ruling: ReturnType<typeof evaluateRuling>
    if (companyOption) {
      const primaryDirector: DirectorSurety = { ref: "primary", input: { ...personalInput, adults: 1 }, suretyState: "intended", consented: true }
      const directors = await loadCompanyDirectorSet(db, id, appliedRentCents, now, reconcileSubject, primaryDirector)
      const poolingRule = await resolvePoolingRule(db, app.org_id) // 14P 0b.4 — the org's dispositive rule (default conservative)
      ruling = evaluateCompanyRuling({
        directors, company: companyOption, poolingRule,
        companyVerdict: ((app as unknown as { free_assessment?: { companyVerdict?: CompanyVerdict } | null }).free_assessment)?.companyVerdict ?? null,
      })
    } else {
      ruling = evaluateRuling(personalInput)
    }

    const iteration = await persistEvaluation(db, { orgId: app.org_id, appId: id, ruling, reconciliation, fraudSignals, declared, unitType, applicantCount, docCount: docs.length })
    await db.from("applications").update({ stage1_status: "pre_screen_complete" }).eq("id", id)
    await db.from("screening_jobs").update({ status: "done", iteration_number: iteration, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", claim.id)

    return NextResponse.json({ ok: true, status: "done" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "screening failed"
    // Leave attempts as-is; the cron retries while attempts < max_attempts.
    await db.from("screening_jobs").update({ status: "failed", error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", claim.id)
    console.error("[applications/screen]", msg)
    return NextResponse.json({ error: "Screening failed" }, { status: 500 })
  }
}

/** Insert a new evaluation iteration. input_snapshot is PII-safe (fix #2): NO raw name/ID. Handles the
 *  iteration UNIQUE-violation race (fix #5) — another pass already wrote this iteration. */
async function persistEvaluation(db: Db, args: {
  orgId: string; appId: string; ruling: ReturnType<typeof evaluateRuling>
  reconciliation: ReconciliationResult; fraudSignals: unknown[]; declared: DeclaredContext
  unitType: string; applicantCount: number; docCount: number
}): Promise<number> {
  const { orgId, appId, ruling, reconciliation, fraudSignals, declared, unitType, applicantCount, docCount } = args
  const { data: latest, error: latestErr } = await db.from("application_screening_evaluations")
    .select("iteration_number").eq("application_id", appId)
    .order("iteration_number", { ascending: false }).limit(1).maybeSingle()
  logQueryError("screen persistEvaluation latest", latestErr)
  const iteration = (latest?.iteration_number ?? 0) + 1
  const { error } = await db.from("application_screening_evaluations").insert({
    org_id: orgId, application_id: appId, iteration_number: iteration,
    ruling_tier: ruling.rulingTier, affordability_tier: ruling.affordability.tier,
    affordability_ratio_pct: ruling.affordability.ratioPct, demonstrated_housing_cents: ruling.affordability.demonstratedHousingCents,
    corroborated_income_cents: ruling.affordability.corroboratedIncomeCents, affordability_corroborated_ratio_pct: ruling.affordability.corroboratedRatioPct,
    confidence_tier: ruling.confidence.tier, flags: ruling.flags,
    reconciliation, fraud_signals: fraudSignals,
    reconciler_version: RECONCILER_VERSION, ruling_version: ruling.rulingVersion,
    // PII-safe snapshot — amounts / source keys / periods only; identity is intentionally omitted.
    input_snapshot: { appliedRentCents: declared.appliedRentCents, incomeSources: declared.incomeSources, unitType, applicantCount, docCount },
  })
  if (error?.code === "23505") {   // another pass wrote this iteration — not a failure
    const { data: cur, error: curErr } = await db.from("application_screening_evaluations").select("iteration_number").eq("application_id", appId).order("iteration_number", { ascending: false }).limit(1).maybeSingle()
    logQueryError("screen persistEvaluation cur", curErr)
    return cur?.iteration_number ?? iteration
  }
  if (error) throw new Error(error.message)
  return iteration
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = new URL(req.url).searchParams.get("token") ?? ""
  const db = await createServiceClient()
  if (!token || !(await tokenAppId(db, token, id))) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }
  const { data: evalRow, error: evalErr } = await db.from("application_screening_evaluations")
    .select("iteration_number, ruling_tier, affordability_tier, affordability_ratio_pct, affordability_corroborated_ratio_pct, corroborated_income_cents, demonstrated_housing_cents, confidence_tier, flags, generated_at")
    .eq("application_id", id).order("iteration_number", { ascending: false }).limit(1).maybeSingle()
  logQueryError("screen GET evaluation", evalErr)
  if (evalRow) return NextResponse.json({ status: "done", evaluation: evalRow })

  const { data: job, error: jobErr } = await db.from("screening_jobs")
    .select("status, attempts, max_attempts").eq("application_id", id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("screen GET job", jobErr)
  const failed = job?.status === "failed" && (job?.attempts ?? 0) >= (job?.max_attempts ?? 0)
  return NextResponse.json({ status: failed ? "failed" : "processing" })
}
