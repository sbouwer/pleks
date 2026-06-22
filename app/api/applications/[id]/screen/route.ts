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
import { evaluateRuling } from "@/lib/applications/ruling"
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { RECONCILER_VERSION, type DeclaredContext, type Document, type ReconciliationResult } from "@/lib/extraction/types"
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

/** Enumerate + download every uploaded doc for the application (no join table — list the storage prefix). */
async function loadDocuments(db: Db, orgId: string, appId: string): Promise<Document[]> {
  const prefix = `applications/${orgId}/${appId}`
  const { data: files, error } = await db.storage.from(BUCKET).list(prefix)
  logQueryError("screen storage.list", error)
  if (!files || files.length === 0) return []
  const docs: Document[] = []
  for (const f of files) {
    if (!f.name || f.name.startsWith(".")) continue
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(`${prefix}/${f.name}`)
    if (dlErr || !blob) { logQueryError("screen storage.download", dlErr); continue }
    docs.push({ path: `${prefix}/${f.name}`, filename: f.name, bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: mimeFromName(f.name) })
  }
  return docs
}

interface AppRow {
  org_id: string; listing_id: string; co_applicants_count: number | null
  first_name: string | null; last_name: string | null; id_number: string | null
  gross_monthly_income_cents: number | null; employment_type: string | null; employment_start_date: string | null
  income_sources: Array<{ key: string; label: string; monthly_cents: number }> | null
  stage1_consent_given: boolean | null
}

function buildDeclared(app: AppRow, appliedRentCents: number): DeclaredContext {
  return {
    appliedRentCents,
    applicant: { fullName: [app.first_name, app.last_name].filter(Boolean).join(" ") || undefined, idNumber: app.id_number ?? undefined },
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
    .select("org_id, listing_id, co_applicants_count, first_name, last_name, id_number, gross_monthly_income_cents, employment_type, employment_start_date, income_sources, stage1_consent_given, listings(asking_rent_cents, units(properties(type)))")
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
    let reconciliation: ReconciliationResult
    let fraudSignals: unknown[] = []
    const docs = await loadDocuments(db, app.org_id, id)
    if (hasFeature(tier, "ai_full") && docs.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const result = await runPipeline(
        { unitType, applicantCount, documents: docs, declared, metadata: { source: "production", orgId: app.org_id, applicationId: id } },
        { orgId: app.org_id, suppressLogging: false, harnessMode: false },
      )
      reconciliation = result.reconciliation
      fraudSignals = result.fraudSignals
    } else {
      reconciliation = reconcile([], declared, new Date())
    }

    const ruling = evaluateRuling({
      appliedRentCents,
      declaredMonthlyIncomeCents: app.gross_monthly_income_cents ?? 0,
      employmentType: app.employment_type,
      employmentStartDate: app.employment_start_date,
      reconciliation,
      now: new Date(),
    })

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
    .select("iteration_number, ruling_tier, affordability_tier, affordability_ratio_pct, demonstrated_housing_cents, confidence_tier, flags, generated_at")
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
