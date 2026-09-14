/**
 * lib/cron/cronDigest.ts — failure-only daily cron digest (ADDENDUM_CRON_RELIABILITY C-1, the "surface")
 *
 * Notes: ONE email to ADMIN_EMAIL summarising the daily orchestrator run, sent ONLY when something went wrong —
 *        a job errored/failed, or (off the C-1 belt's { sent, failed }) emails failed to send. A clean run sends
 *        nothing (no-news-is-good-news). Best-effort + guarded: no-op (logged) if ADMIN_EMAIL/RESEND_API_KEY
 *        unset. Mirrors the check-links ADMIN_EMAIL alert pattern.
 *        Two grades since 2026-09-14 (Stéan's ruling): FAILING — still failing when the digest runs — and
 *        INTERMITTENT — failed in the window, succeeded since. Both raise an item; the subject counts them
 *        apart so the inbox alone says which kind of morning it is. See classifyCronRuns for why the line
 *        sits at "latest run failed" and not at "no success in 24h".
 */
import { sendEmail } from "@/lib/comms/send-email"
import { PLATFORM_ORG_ID, preformatted } from "@/lib/comms/platform-org"
import { optionalEnv } from "@/lib/env"

export interface CronJobDetail {
  status: string            // "ok" | "failed" | "error" | "partial" | "intermittent" | "skipped (…)"
  sent?: number             // from the C-1 belt's Response.json
  /**
   * Items the job itself reported as failed. Never a count of failed RUNS — those are in `runs`.
   * For an in-process job and the C-1 belt ({ sent, failed }) these are emails. An out-of-process job's unit
   * is its own: screening_line_runner reports failed screening LINES. So nothing may render this as "emails"
   * unless the job also reported `sent`.
   */
  failed?: number
  /**
   * An out-of-process cron's runs over the digest window, from cron_runs. Its own field because the
   * rollup used to put the failed-RUN count into `failed`, and the full-run list then printed
   * "failed (sent 0, failed 7)" — seven runs, reading as seven bounced emails.
   */
  runs?: { total: number; failed: number; lastSuccessAt?: string }
  /**
   * Work the job deliberately held back because it could not establish a precondition — today,
   * M-074's purge gate refusing to delete an org whose 30-day warning was never delivered.
   *
   * Its own field rather than a bump to `failed`: the job ran correctly and nothing errored, so
   * every other signal reads green, yet a human must act or the row defers forever — and
   * indefinite retention is a POPIA failure in its own right. Folded into `failed` it would read
   * as "N emails bounced" and be chased down the wrong path.
   */
  deferred?: number
  error?: string
}

/**
 * Exported for probing. This predicate is the ONLY thing standing between "the cron held work back"
 * and silence — a digest that does not classify a deferral as an issue sends nothing, and the
 * deferral is then invisible everywhere (M-074 part 3). Worth a test of its own.
 */
export function isIssue(d: CronJobDetail): boolean {
  return d.status === "failed" || d.status === "error" || d.status === "partial" || d.status === "intermittent"
    || (d.failed ?? 0) > 0 || (d.deferred ?? 0) > 0
}

/** One cron_runs row, as collectCronRunFailures selects it. */
export interface CronRunRow {
  job_name: string | null
  status: string | null
  error_message: string | null
  metadata: unknown
  finished_at: string | null
}

/** A timestamp as "YYYY-MM-DD HH:MM UTC". Never throws: an unparseable value is printed as it came, because
 *  a throw here would escape collectCronRunFailures and lose the whole digest, in-process failures included. */
const utcMinute = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`
}

/**
 * The digest's clock: when it runs, and how long each tracked job may go without a success (TRACKED_CRONS,
 * lib/cron/cadence.ts). Optional so the grade can be probed without one; the digest always passes it.
 */
export interface CronClock { now: number; freshnessMs: Readonly<Record<string, number>> }

/**
 * Grade each out-of-process cron by whether it is STILL failing when the digest runs.
 *
 *   failed        its latest run failed, so nothing has succeeded since. A once-a-day job that fails lands
 *                 here automatically: its only run in the window is its latest.
 *                 ALSO when its last recorded success is older than its staleness limit, whatever came
 *                 before it. See the clock note below.
 *   intermittent  it failed during the window, and a later run succeeded.
 *
 * ⚠ Deliberately NOT "no successful run in the window". At a 03:00 digest, a 15-minute job that broke at
 * 18:00 still has its morning successes, so that rule would call nine hours of failure a blip — and would
 * need a whole day of failed runs before saying "failing". The tail is what says whether it is down.
 *
 * ⚠ The tail is the latest RECORDED run, and recording is lossy. A run killed at the platform limit never
 * reaches its insert, and the insert is best-effort — during the 2026-09-14 storm the 504s landed at exactly
 * the minutes these inserts run. So a job that fails once, succeeds once, and then stops recording would
 * read "intermittent, has succeeded since" for a day. The clock closes that for tracked jobs: a success older
 * than the job's staleness limit is not "since", it is the last thing anyone heard. Found by the pre-PR
 * walk (walker F1). A job with NO row in the window, or outside TRACKED_CRONS, is still unseen here — M-133.
 *
 * Intermittent still raises an item (isIssue), and the digest still sends. The storm this was written
 * during (2026-09-14: 7/88, 7/20, 3/6 and 2/6 runs failed) was intermittent in every job and had been
 * growing for three days; a digest that went quiet on intermittent would have hidden all of it.
 *
 * Pure, so it is probed without a database. Rows may arrive in any order; they are sorted here.
 */
export function classifyCronRuns(rows: CronRunRow[], sinceHours: number, clock?: CronClock): Record<string, CronJobDetail> {
  const byJob = new Map<string, CronRunRow[]>()
  for (const row of rows) {
    const job = row.job_name ?? "unknown"
    byJob.set(job, [...(byJob.get(job) ?? []), row])
  }
  const detail: Record<string, CronJobDetail> = {}
  for (const [job, list] of byJob) {
    const maxAgeMs = clock?.freshnessMs[job]
    const graded = gradeJob(list, sinceHours, clock && maxAgeMs !== undefined ? { now: clock.now, maxAgeMs } : undefined)
    if (graded) detail[job] = graded
  }
  return detail
}

/** One job's runs, oldest first, as the counts the grade is decided from. */
function tallyRuns(sorted: CronRunRow[]) {
  let failedRuns = 0, itemsFailed = 0, trailing = 0
  let sent: number | undefined
  let lastError: string | undefined, lastSuccessAt: string | undefined
  for (const row of sorted) {
    if (row.status === "failed") {
      failedRuns++
      trailing++
      if (row.error_message) lastError = row.error_message
    } else {
      trailing = 0
      if (row.finished_at) lastSuccessAt = row.finished_at
    }
    const m = row.metadata as { failed?: unknown; sent?: unknown } | null
    if (typeof m?.failed === "number") itemsFailed += m.failed
    if (typeof m?.sent === "number") sent = (sent ?? 0) + m.sent
  }
  return { failedRuns, itemsFailed, sent, trailing, lastError, lastSuccessAt }
}

/** The stale-tail sentence, or null when the tail is fresh or the job has no staleness limit. */
function staleTail(lastSuccessAt: string | undefined, fresh: { now: number; maxAgeMs: number } | undefined): string | null {
  if (!fresh || !lastSuccessAt) return null
  const t = Date.parse(lastSuccessAt)
  if (Number.isNaN(t) || fresh.now - t <= fresh.maxAgeMs) return null
  return `nothing recorded since its last success at ${utcMinute(lastSuccessAt)}, past its ${Math.round(fresh.maxAgeMs / 3_600_000)}h staleness limit — a run that died before recording, or a cron_runs row that was not written`
}

function gradeJob(list: CronRunRow[], sinceHours: number, fresh?: { now: number; maxAgeMs: number }): CronJobDetail | null {
  const at = (r: CronRunRow) => {
    const t = r.finished_at ? Date.parse(r.finished_at) : Number.NaN
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
  }
  const sorted = [...list].sort((a, b) => at(a) - at(b))
  const { failedRuns, itemsFailed, sent, trailing, lastError, lastSuccessAt } = tallyRuns(sorted)
  // A trailing failure is already failing; only a successful tail can be stale.
  const stale = trailing === 0 ? staleTail(lastSuccessAt, fresh) : null
  if (failedRuns === 0 && itemsFailed === 0 && !stale) return null

  const total = sorted.length
  const runs = { total, failed: failedRuns, lastSuccessAt }
  const counts = { ...(sent !== undefined ? { sent } : {}), ...(itemsFailed > 0 ? { failed: itemsFailed } : {}) }
  const tail = lastError ? ` — ${lastError}` : ""
  if (trailing > 0) {
    const since = lastSuccessAt ? `no success since ${utcMinute(lastSuccessAt)}` : `no success in ${sinceHours}h`
    const which = total === 1 ? `its only run in ${sinceHours}h failed` : `the last ${trailing} of ${total} runs failed`
    return { status: "failed", ...counts, runs, error: `${which}, ${since}${tail}` }
  }
  if (stale) return { status: "failed", ...counts, runs, error: `${stale}${tail}` }
  if (failedRuns === 0) {
    return { status: "partial", ...counts, runs,
      error: `${itemsFailed} item(s) reported failed across ${total} runs in ${sinceHours}h` }
  }
  const last = lastSuccessAt ? `, last success ${utcMinute(lastSuccessAt)}` : ""
  return { status: "intermittent", ...counts, runs,
    error: `${failedRuns}/${total} runs failed in ${sinceHours}h, and it has succeeded since${last}${tail}` }
}

/**
 * The digest's text, or null when there is nothing to send. Split from sendCronDigest so the grading and
 * the subject line are probed without an email transport.
 */
export function renderCronDigest(
  ranAt: string,
  detail: Record<string, CronJobDetail>,
): { subject: string; body: string; failing: number; intermittent: number } | null {
  const issues = Object.entries(detail).filter(([, d]) => isIssue(d))
  if (issues.length === 0) return null   // clean run → silence

  const intermittentIssues = issues.filter(([, d]) => d.status === "intermittent")
  const failingIssues = issues.filter(([, d]) => d.status !== "intermittent")

  const failingLine = ([name, d]: [string, CronJobDetail]) => {
    if ((d.deferred ?? 0) > 0) {
      return `  ⏸ ${name}: ${d.deferred} item(s) HELD BACK pending a human — see subscriptions.purge_deferred_reason`
    }
    if ((d.failed ?? 0) > 0 && d.status !== "error" && d.status !== "failed") {
      // Emails only when the job reported `sent` too — see CronJobDetail.failed.
      return d.sent === undefined
        ? `  ⚠ ${name}: ${d.failed} item(s) reported failed`
        : `  ⚠ ${name}: ${d.failed} email(s) failed to send (${d.sent} sent)`
    }
    return `  ✗ ${name}: ${d.status}${d.error ? ` — ${d.error}` : ""}`
  }
  const intermittentLine = ([name, d]: [string, CronJobDetail]) => `  ↻ ${name}: ${d.error ?? "intermittent"}`

  const allLines = Object.entries(detail)
    .map(([name, d]) => {
      const runs = d.runs ? ` (${d.runs.failed}/${d.runs.total} runs failed)` : ""
      // Only the counts the job reported: a `failed` with no `sent` printed as "sent 0" read as bounced emails.
      const parts = [d.sent != null ? `sent ${d.sent}` : null, d.failed != null ? `failed ${d.failed}` : null].filter(Boolean)
      const counts = parts.length > 0 ? ` (${parts.join(", ")})` : ""
      return `  ${name}: ${d.status}${runs}${counts}`
    })
    .join("\n")

  const f = failingIssues.length, i = intermittentIssues.length
  const tally = i > 0 ? `${f} failing, ${i} intermittent` : `${f} failing`
  const sections: string[] = []
  if (f > 0) sections.push(`Failing now:\n${failingIssues.map(failingLine).join("\n")}`)
  if (i > 0) sections.push(`Intermittent — failed in the last 24h, and has succeeded since:\n${intermittentIssues.map(intermittentLine).join("\n")}`)

  // Was a raw resend.emails.send with a `text:` body. sendEmail has no text channel, and this report is
  // column-aligned, so it ships as a monospace <pre> fragment through the central branded template.
  const body = [
    `The daily cron run at ${ranAt} found ${tally}.\n`,
    sections.join("\n\n"),
    "\n— full run —",
    allLines,
    "\nThis digest is sent only when something fails. A clean run sends nothing.",
    "Failing: the latest run failed (a once-a-day job's only run is its latest), or nothing has been recorded",
    "since its last success for longer than its staleness limit. Intermittent: a run failed",
    "in the last 24h, and a later run succeeded — still worth reading, because a rising rate is how an outage starts.",
  ].join("\n")

  return { subject: `[Pleks] daily cron — ${tally}`, body, failing: f, intermittent: i }
}

export async function sendCronDigest(
  ranAt: string,
  detail: Record<string, CronJobDetail>,
): Promise<{ emailed: boolean; issueCount: number }> {
  const digest = renderCronDigest(ranAt, detail)
  if (!digest) return { emailed: false, issueCount: 0 }
  const issueCount = digest.failing + digest.intermittent

  const adminEmail = optionalEnv("ADMIN_EMAIL")
  const resendKey = optionalEnv("RESEND_API_KEY")
  if (!adminEmail || !resendKey) {
    // The body, not only the subject: with no email this log is the only record, and a count names no job.
    console.error("[cron-digest] issues detected but ADMIN_EMAIL/RESEND_API_KEY not set:", digest.subject, "\n" + digest.body)
    return { emailed: false, issueCount }
  }

  const result = await sendEmail({
    orgId:       PLATFORM_ORG_ID,
    templateKey: "ops.cron_digest",
    to:          { email: adminEmail, name: "Pleks admin" },
    subject:     digest.subject,
    contentHtml: preformatted(digest.body),
  })

  if (!result.success) {
    console.error("[cron-digest] email failed:", result.error)
    return { emailed: false, issueCount }
  }
  return { emailed: true, issueCount }
}
