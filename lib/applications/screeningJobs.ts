/**
 * lib/applications/screeningJobs.ts — enqueue + fire the 14M pre-screen (`screening_jobs` → POST /screen).
 *
 * Auth:   none of its own — callers pass a service client and the org they already resolved (the applicant
 *         credential in /submit, /submit-to-agent and /screen; gateway() in shortlistStage1Action). Every query is
 *         org-scoped EXCEPT application_tokens, which has no org_id (005:480) — there the application id is the
 *         boundary. The org-scope lint cannot see this file (an injected client names no service-client token —
 *         M-143), so the scoping here is held by review, not by the rule.
 * Data:   screening_jobs (insert, dedupe), application_screening_evaluations (count + latest), applications
 *         (consent), application_documents (changed since the latest evaluation), application_tokens (live token).
 * Notes:  A18. Until this file, nothing inserted a `screening_jobs` row, so /screen and its cron were reliability
 *         machinery for rows nobody created (verify-14m rows 7/8, anchored 83c7efe4). The automatic triggers
 *         (review open, submit-to-agent, shortlist) queue a pass only when there is no evaluation yet or the
 *         documents changed after the latest one — so the agent never rules on documents the applicant replaced,
 *         and an unchanged application is never re-scanned. Enqueue is cap-checked against
 *         MAX_SCREENING_ITERATIONS, refuses while a job is live, and dedupes after insert (oldest live job wins),
 *         so concurrent callers cannot stack AI runs without a unique index. It queues nothing without stage-1
 *         consent or a live token: /screen would 403 or never be fired, and the job would sit "live" forever. It
 *         queues nothing for an erased, purged or deleted application — the one choke point every trigger passes.
 *         The fire is best-effort: the screening-jobs cron is the backstop.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { MAX_SCREENING_ITERATIONS } from "@/lib/constants"
import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { REDACTED } from "@/lib/popia/anonymisePlan"
import { applicantTodos, type ApplicantTodo } from "./applicantTodos"
import type { RulingFlag } from "./ruling"

/** stage1 values an agent decision set. No automated writer (/screen, /documents, /submit) may move an
 *  application out of them — a late pass used to demote a shortlisted application to pre_screen_complete. */
const STAGE1_DECIDED = ["shortlisted", "not_shortlisted"] as const
/** The same set as a PostgREST `not.in` operand: `.not("stage1_status", "in", STAGE1_DECIDED_IN)`. */
export const STAGE1_DECIDED_IN = `(${STAGE1_DECIDED.join(",")})`

export type EnqueueResult = "queued" | "active" | "screened" | "cap" | "not-entitled" | "not-ready" | "erased" | "error"

/** The application's applicant was stripped — a DSAR erasure (the `[erased]` sentinel on the NOT NULL email) or the
 *  90-day declined purge (its `pii_purged_at` latch, which stamps after the same strip). Nothing may screen it again:
 *  a pass would process a subject who exercised erasure, against documents the erasure already deleted. */
export function isStrippedApplication(app: { applicant_email?: unknown; pii_purged_at?: unknown }): boolean {
  return app.applicant_email === REDACTED || (app.pii_purged_at !== null && app.pii_purged_at !== undefined)
}

interface JobRow { status: string; attempts: number; max_attempts: number }

/** A job the cron or /screen will still run: pending/running, or failed with attempts left. */
export function isLiveJob(job: JobRow | null): boolean {
  if (!job) return false
  if (job.status === "pending" || job.status === "running") return true
  return job.status === "failed" && job.attempts < job.max_attempts
}

export type ScreenStatus = "none" | "processing" | "done" | "failed"
/** GET /screen's body — the applicant's view of the pre-screen: to-dos only, never the ruling. */
export interface ScreenStatusView { status: ScreenStatus; todos: ApplicantTodo[]; canRecheck: boolean }

/** GET /screen's response, pure. A live job wins over an older evaluation (a re-check reads as processing); with
 *  no job and no evaluation nothing is queued ("none"), which the UI must not render as a spinner. */
export function screenStatusView(args: {
  job: JobRow | null
  evaluation: { iteration_number: number; flags: unknown; fraud_signals: unknown } | null
  maxIterations: number
}): ScreenStatusView {
  const { job, evaluation, maxIterations } = args
  if (isLiveJob(job)) return { status: "processing", todos: [], canRecheck: false }
  if (evaluation) {
    const todos = applicantTodos(evaluation.flags as RulingFlag[] | null, evaluation.fraud_signals as unknown[] | null)
    return { status: "done", todos, canRecheck: todos.length > 0 && evaluation.iteration_number < maxIterations }
  }
  if (job) return { status: "failed", todos: [], canRecheck: false }
  return { status: "none", todos: [], canRecheck: false }
}

/** The decision, pure: whether a new job may be inserted. Without `force`, an application already evaluated is
 *  re-queued only when its documents changed after the latest evaluation (the automatic triggers); `force` is the
 *  applicant's explicit "check again". */
export function enqueueDecision(args: { evalCount: number; docsChanged: boolean; latestJob: JobRow | null; force: boolean }): "screened" | "cap" | "active" | "insert" {
  if (!args.force && args.evalCount > 0 && !args.docsChanged) return "screened"
  if (args.evalCount >= MAX_SCREENING_ITERATIONS) return "cap"
  if (isLiveJob(args.latestJob)) return "active"
  return "insert"
}

/** The newest unexpired application token — what /screen authenticates with. application_tokens carries no org_id
 *  (005:480); every caller has already bound applicationId to its org, so the application id is the boundary. */
async function liveToken(db: SupabaseClient, applicationId: string): Promise<{ token: string | null; error: boolean }> {
  const { data, error } = await db.from("application_tokens")
    .select("token")
    .eq("application_id", applicationId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("screeningJobs live token", error)
  return { token: (data?.token as string | undefined) ?? null, error: !!error }
}

/** When the latest pass READ the documents — its job's started_at (claimed just before loadDocuments), never the
 *  evaluation's generated_at, which is stamped after the pipeline: a document uploaded mid-pass is newer than the
 *  read but older than the write, and anchoring on the write hides it for good (A18 walker N1). Falls back to
 *  generated_at for an evaluation with no done job. undefined = query error.
 *  Keyed on the job that WROTE this evaluation (`iteration_number`, stamped only on a pass that persisted one), never
 *  on the latest done job: /screen's cap branch claims a job — stamping started_at — and marks it done with no
 *  evaluation, so "latest" can postdate the read and hide a change at exactly the cap (a18-staleness walker W1). */
async function passReadAt(db: SupabaseClient, orgId: string, applicationId: string, evaluation: PassEvaluation): Promise<string | null | undefined> {
  const { data, error } = await db.from("screening_jobs")
    .select("started_at")
    .eq("org_id", orgId).eq("application_id", applicationId).eq("status", "done")
    .eq("iteration_number", evaluation.iteration_number).not("started_at", "is", null)
    .order("finished_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("enqueueScreening pass read-at", error)
  if (error) return undefined
  return (data?.started_at as string | undefined) ?? evaluation.generated_at
}

/** The evaluation a staleness test is about: the one shown, or the one a re-queue would supersede. */
export interface PassEvaluation { iteration_number: number; generated_at: string }

/** Whether the documents changed after `evaluation`'s pass read them. null = query error. Also read by the agent's
 *  ruling card, so the staleness it shows is the same test that decides a re-queue (A18 walker N2). */
export async function docsChangedSinceLastPass(db: SupabaseClient, orgId: string, applicationId: string, evaluation: PassEvaluation): Promise<boolean | null> {
  const since = await passReadAt(db, orgId, applicationId, evaluation)
  if (since === undefined) return null
  return since ? await docsChangedSince(db, orgId, applicationId, since) : false
}

/** Whether any document was added or removed after `since` (when the latest pass read them). A same-path re-upload adds no
 *  registry row (documentRegistry is idempotent on the path), so it is not seen here; "check again" covers it. */
async function docsChangedSince(db: SupabaseClient, orgId: string, applicationId: string, since: string): Promise<boolean | null> {
  const t = new Date(since).toISOString()
  const { count, error } = await db.from("application_documents")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("application_id", applicationId)
    .or(`uploaded_at.gt.${t},deleted_at.gt.${t}`)
  logQueryError("enqueueScreening docs changed", error)
  return error ? null : (count ?? 0) > 0
}

/**
 * Insert one pending `screening_jobs` row for the application, when `enqueueDecision` allows it. Refuses (and
 * inserts nothing) without ai_full, without stage-1 consent, or without a live token to fire /screen with.
 */
export async function enqueueScreening(
  db: SupabaseClient,
  args: { orgId: string; applicationId: string; force?: boolean },
): Promise<EnqueueResult> {
  const { orgId, applicationId } = args
  const force = args.force === true
  // Without ai_full, /screen degrades to a declared-only pass that never reads the uploaded documents, so its
  // "upload a statement" to-dos would ask for documents the applicant already gave. Queue nothing instead; the
  // free assessment is that org's step-1 read. (Canonical tier: no agent cookie on the applicant paths.)
  if (!hasFeature(await getOrgTierCanonical(orgId), "ai_full")) return "not-entitled"

  // /screen 403s without consent BEFORE it claims, and nothing fires a job with no live token — either way the
  // job would never advance its attempts and would read as "live" forever, blocking every later enqueue.
  const { data: app, error: appErr } = await db.from("applications")
    .select("stage1_consent_given, applicant_email, pii_purged_at, deleted_at").eq("id", applicationId).eq("org_id", orgId).maybeSingle()
  logQueryError("enqueueScreening consent", appErr)
  if (appErr) return "error"
  // Before consent: erasure keeps stage1_consent_given (consent_log is retained evidence), so consent alone would
  // pass an erased lead. A deleted application is gone from the agent's view and has no pass to read either.
  if (app && (isStrippedApplication(app) || app.deleted_at !== null)) return "erased"
  if (app?.stage1_consent_given !== true) return "not-ready"
  const tok = await liveToken(db, applicationId)
  if (tok.error) return "error"
  if (!tok.token) return "not-ready"

  const { data: latestEval, count, error: evalErr } = await db.from("application_screening_evaluations")
    .select("iteration_number, generated_at", { count: "exact" })
    .eq("org_id", orgId).eq("application_id", applicationId)
    .order("iteration_number", { ascending: false }).limit(1)
  logQueryError("enqueueScreening evaluations", evalErr)
  if (evalErr) return "error"
  const evalCount = count ?? 0
  const shown = latestEval?.[0] as PassEvaluation | undefined
  const docsChanged = !force && shown
    ? await docsChangedSinceLastPass(db, orgId, applicationId, shown)
    : false
  if (docsChanged === null) return "error"

  const { data: latestJob, error: jobErr } = await db.from("screening_jobs")
    .select("status, attempts, max_attempts")
    .eq("org_id", orgId).eq("application_id", applicationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("enqueueScreening latest job", jobErr)
  if (jobErr) return "error"

  const decision = enqueueDecision({ evalCount, docsChanged, latestJob: latestJob as JobRow | null, force })
  if (decision !== "insert") return decision

  const { data: inserted, error: insErr } = await db.from("screening_jobs")
    .insert({ org_id: orgId, application_id: applicationId, status: "pending" })
    .select("id").single()
  logQueryError("enqueueScreening insert", insErr)
  if (insErr || !inserted) return "error"
  return await keepOldestLiveJob(db, orgId, applicationId, inserted.id as string)
}

/** Check-then-insert races: two concurrent callers can both pass the checks and both insert. Without a unique
 *  index (DDL, out of A18's scope) the tie-break is here: every racer reads the live jobs in the same order and
 *  keeps the oldest, so exactly one survives and the rest delete their own row. */
async function keepOldestLiveJob(db: SupabaseClient, orgId: string, applicationId: string, ownId: string): Promise<EnqueueResult> {
  const { data: oldest, error } = await db.from("screening_jobs")
    .select("id")
    .eq("org_id", orgId).eq("application_id", applicationId).in("status", ["pending", "running"])
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle()
  logQueryError("enqueueScreening dedupe", error)
  if (error || !oldest || oldest.id === ownId) return "queued"
  const { error: delErr } = await db.from("screening_jobs").delete()
    .eq("id", ownId).eq("org_id", orgId).eq("status", "pending")
  logQueryError("enqueueScreening dedupe delete", delErr)
  return "active"
}

/**
 * Fire POST /screen for the application with its newest live application token — the same dispatch the cron
 * makes. Best-effort with a short timeout: /screen runs as its own invocation, and the cron re-fires anything
 * that did not land. Call it from `after()` so it never holds the caller's response.
 */
export async function fireScreening(db: SupabaseClient, args: { applicationId: string }): Promise<void> {
  const tok = await liveToken(db, args.applicationId)
  if (!tok.token) return
  try {
    await fetch(absoluteUrl(`/api/applications/${args.applicationId}/screen`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tok.token }), signal: AbortSignal.timeout(2500),
    })
  } catch { /* the screening-jobs cron re-fires a job that did not land */ }
}
