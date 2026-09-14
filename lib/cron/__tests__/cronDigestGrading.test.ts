/**
 * lib/cron/__tests__/cronDigestGrading.test.ts — failing versus intermittent (Stéan's ruling, 2026-09-14)
 *
 * Notes:  the digest used to call any failed run in 24h a failure, so a 15-minute job with one 504 read
 *         the same as a job that was down. The two grades are probed in both directions, plus the case that
 *         decided where the line sits: a job that DIED hours before the digest still has earlier successes
 *         in the window, and must read as failing, not as a blip.
 */
import { describe, it, expect } from "vitest"
import { classifyCronRuns, isIssue, renderCronDigest, type CronRunRow } from "../cronDigest"

const T0 = Date.parse("2026-09-13T03:00:00Z")
const run = (job: string, status: "completed" | "failed", minutes: number, error?: string, metadata: unknown = {}): CronRunRow => ({
  job_name: job,
  status,
  error_message: error ?? null,
  metadata,
  finished_at: new Date(T0 + minutes * 60_000).toISOString(),
})

describe("classifyCronRuns — failing means the latest run failed", () => {
  it("a once-a-day job whose only run failed is failing, with no threshold to cross", () => {
    const d = classifyCronRuns([run("daily_x", "failed", 60, "boom")], 24).daily_x
    expect(d.status).toBe("failed")
    expect(d.error).toContain("its only run in 24h failed")
    expect(d.error).toContain("boom")
  })

  it("a 15-minute job that DIED mid-window is failing, though its morning runs succeeded", () => {
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => run("screening_line_runner", "completed", i * 15)),
      ...Array.from({ length: 36 }, (_, i) => run("screening_line_runner", "failed", 900 + i * 15, "Gateway Timeout")),
    ]
    const d = classifyCronRuns(rows, 24).screening_line_runner
    expect(d.status).toBe("failed")
    expect(d.error).toContain("the last 36 of 96 runs failed")
    expect(d.error).toContain("no success since 2026-09-13 17:45 UTC")
  })

  it("a job that never succeeded in the window says so", () => {
    const d = classifyCronRuns([run("j", "failed", 0), run("j", "failed", 60)], 24).j
    expect(d.status).toBe("failed")
    expect(d.error).toContain("no success in 24h")
  })
})

describe("classifyCronRuns — intermittent means it failed, then succeeded", () => {
  it("a failure followed by a success is intermittent, and still an issue", () => {
    const d = classifyCronRuns([run("j", "completed", 0), run("j", "failed", 15, "Gateway Timeout"), run("j", "completed", 30)], 24).j
    expect(d.status).toBe("intermittent")
    expect(d.error).toBe("1/3 runs failed in 24h, and it has succeeded since, last success 2026-09-13 03:30 UTC — Gateway Timeout")
    expect(isIssue(d)).toBe(true)
  })

  it("grades by time, not by row order — the same rows arriving shuffled grade the same", () => {
    const rows = [run("j", "completed", 30), run("j", "failed", 15), run("j", "completed", 0)]
    expect(classifyCronRuns(rows, 24).j.status).toBe("intermittent")
    const tailFailed = [run("j", "failed", 30), run("j", "completed", 15), run("j", "completed", 0)]
    expect(classifyCronRuns(tailFailed, 24).j.status).toBe("failed")
  })
})

describe("classifyCronRuns — the quiet direction", () => {
  it("a job with no failed run and no failed email raises nothing", () => {
    expect(classifyCronRuns([run("j", "completed", 0), run("j", "completed", 15)], 24)).toEqual({})
  })
})

// Walker F1 (2026-09-14): the tail is the latest RECORDED run, and a run that dies before recording, or whose
// cron_runs insert is lost, leaves an old success as the tail. The clock stops that reading as "succeeded since".
describe("classifyCronRuns — with the digest's clock, a stale tail is failing", () => {
  const HOUR = 3_600_000
  const at = (minutes: number) => T0 + minutes * 60_000
  const clock = (nowMinutes: number) => ({ now: at(nowMinutes), freshnessMs: { screening_line_runner: 2 * HOUR } })

  it("failed then succeeded, then nothing recorded for 20h, is failing — not intermittent", () => {
    const rows = [run("screening_line_runner", "failed", 180, "Gateway Timeout"), run("screening_line_runner", "completed", 195)]
    const d = classifyCronRuns(rows, 24, clock(1440)).screening_line_runner
    expect(d.status).toBe("failed")
    expect(d.error).toBe("nothing recorded since its last success at 2026-09-13 06:15 UTC, past its 2h staleness limit — a run that died before recording, or a cron_runs row that was not written — Gateway Timeout")
  })

  it("a tracked job that went quiet with no failure at all is failing too", () => {
    const d = classifyCronRuns([run("screening_line_runner", "completed", 195)], 24, clock(1440)).screening_line_runner
    expect(d.status).toBe("failed")
    expect(d.runs).toMatchObject({ total: 1, failed: 0 })
  })

  it("the same rows inside the staleness limit stay intermittent", () => {
    const rows = [run("screening_line_runner", "failed", 180), run("screening_line_runner", "completed", 195)]
    expect(classifyCronRuns(rows, 24, clock(195 + 119)).screening_line_runner.status).toBe("intermittent")
  })

  it("a fresh, clean tracked job raises nothing", () => {
    expect(classifyCronRuns([run("screening_line_runner", "completed", 1425)], 24, clock(1440))).toEqual({})
  })

  it("a job with no staleness limit is graded on its rows alone", () => {
    const rows = [run("screening_jobs", "failed", 180), run("screening_jobs", "completed", 195)]
    expect(classifyCronRuns(rows, 24, clock(1440)).screening_jobs.status).toBe("intermittent")
  })
})

describe("classifyCronRuns — runs are not emails", () => {
  it("failed RUNS go to `runs`, never into `failed` — the 'sent 0, failed 7' misreading", () => {
    const rows = [...Array.from({ length: 7 }, (_, i) => run("j", "failed", i)), run("j", "completed", 100)]
    const d = classifyCronRuns(rows, 24).j
    expect(d.failed).toBeUndefined()
    expect(d.runs).toMatchObject({ total: 8, failed: 7 })
  })

  it("a job's own failed count still goes to `failed`", () => {
    const d = classifyCronRuns([run("j", "failed", 0, undefined, { failed: 3 })], 24).j
    expect(d.failed).toBe(3)
  })

  // Walker F2: `failed` is whatever unit the job counts. With no `sent`, printing "sent 0" made it read as emails.
  it("a count with no `sent` is not printed as bounced emails", () => {
    const rows = [run("screening_line_runner", "failed", 0, undefined, { failed: 2 }), run("screening_line_runner", "completed", 15)]
    const out = renderCronDigest("t", classifyCronRuns(rows, 24))!
    expect(out.body).toContain("  screening_line_runner: intermittent (1/2 runs failed) (failed 2)")
    expect(out.body).not.toContain("sent 0")
  })

  it("a job that reported `sent` has it carried, so 497 of 500 does not read as nothing sent", () => {
    const out = renderCronDigest("t", classifyCronRuns([run("application_reminders", "failed", 0, undefined, { sent: 497, failed: 3 })], 24))!
    expect(out.body).toContain("  application_reminders: failed (1/1 runs failed) (sent 497, failed 3)")
  })
})

describe("classifyCronRuns — an unparseable timestamp cannot lose the digest", () => {
  it("does not throw, because a throw would escape collectCronRunFailures and drop every other item", () => {
    const rows: CronRunRow[] = [{ ...run("j", "completed", 0), finished_at: "not-a-date" }, run("j", "failed", 15)]
    expect(() => classifyCronRuns(rows, 24, { now: T0 + 86_400_000, freshnessMs: { j: 3_600_000 } })).not.toThrow()
    expect(classifyCronRuns(rows, 24).j.error).toContain("no success since not-a-date")
  })
})

describe("renderCronDigest — the subject says which kind of morning it is", () => {
  it("a clean run renders nothing", () => {
    expect(renderCronDigest("t", { a: { status: "ok" }, b: { status: "skipped (not 1st)" } })).toBeNull()
  })

  it("the 2026-09-14 digest, replayed: four recovered jobs are 0 failing, 4 intermittent", () => {
    const rows: CronRunRow[] = []
    for (const [job, failed, total] of [["screening_line_runner", 7, 88], ["mandatory_retry", 7, 20], ["bank_feed_sync", 3, 6], ["check_links", 2, 6]] as const) {
      for (let i = 0; i < total; i++) rows.push(run(job, i < failed ? "failed" : "completed", i, i < failed ? "Gateway Timeout" : undefined))
    }
    const out = renderCronDigest("2026-09-14T03:00:04.770Z", { invoice_generate: { status: "ok" }, ...classifyCronRuns(rows, 24) })!
    expect(out.subject).toBe("[Pleks] daily cron — 0 failing, 4 intermittent")
    expect(out.body).toContain("  screening_line_runner: intermittent (7/88 runs failed)")
    expect(out.body).not.toContain("failed 7)")
    expect(out.body).not.toContain("Failing now:")
  })

  it("one failing and no intermittent reads '1 failing', without an empty intermittent count", () => {
    const out = renderCronDigest("t", { holiday_horizon: { status: "error", error: "down" } })!
    expect(out.subject).toBe("[Pleks] daily cron — 1 failing")
    expect(out.body).toContain("Failing now:\n  ✗ holiday_horizon: error — down")
  })

  it("both kinds are counted apart", () => {
    const out = renderCronDigest("t", {
      a: { status: "failed", error: "x" },
      b: { status: "ok", deferred: 1 },
      c: { status: "intermittent", error: "1/4 runs failed in 24h" },
    })!
    expect(out.subject).toBe("[Pleks] daily cron — 2 failing, 1 intermittent")
    expect(out.body).toContain("  ↻ c: 1/4 runs failed in 24h")
  })
})
