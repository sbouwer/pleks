/**
 * lib/applications/__tests__/screeningJobs.test.ts — A18 enqueue rules, the GET /screen view, and the wiring that
 * holds them (source assertions: the trigger sites, the no-demotion guard, and the ruling never reaching GET).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { enqueueDecision, isLiveJob, screenStatusView, STAGE1_DECIDED_IN } from "../screeningJobs"
import { MAX_SCREENING_ITERATIONS } from "@/lib/constants"

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const job = (status: string, attempts = 0, max_attempts = 3) => ({ status, attempts, max_attempts })

describe("isLiveJob", () => {
  it("pending and running are live; failed is live only with attempts left", () => {
    expect(isLiveJob(job("pending"))).toBe(true)
    expect(isLiveJob(job("running"))).toBe(true)
    expect(isLiveJob(job("failed", 1))).toBe(true)
    expect(isLiveJob(job("failed", 3))).toBe(false)
    expect(isLiveJob(job("done"))).toBe(false)
    expect(isLiveJob(null)).toBe(false)
  })
})

describe("enqueueDecision", () => {
  const d = (over: Partial<Parameters<typeof enqueueDecision>[0]>) =>
    enqueueDecision({ evalCount: 0, docsChanged: false, latestJob: null, force: false, ...over })
  it("inserts on a fresh application", () => {
    expect(d({})).toBe("insert")
  })
  it("an automatic trigger never re-scans unchanged documents", () => {
    expect(d({ evalCount: 1, latestJob: job("done") })).toBe("screened")
  })
  it("an automatic trigger re-scans when the documents changed — the agent never rules on replaced documents", () => {
    expect(d({ evalCount: 1, docsChanged: true, latestJob: job("done") })).toBe("insert")
    expect(d({ evalCount: MAX_SCREENING_ITERATIONS, docsChanged: true, latestJob: job("done") })).toBe("cap")
  })
  it("a re-check queues the next iteration, up to the cap", () => {
    expect(d({ evalCount: 1, latestJob: job("done"), force: true })).toBe("insert")
    expect(d({ evalCount: MAX_SCREENING_ITERATIONS, latestJob: job("done"), force: true })).toBe("cap")
  })
  it("never stacks a job on a live one", () => {
    expect(d({ latestJob: job("pending"), force: true })).toBe("active")
    expect(d({ latestJob: job("failed", 1), force: true })).toBe("active")
  })
})

describe("screenStatusView", () => {
  const evaluation = (iteration_number: number, flags: unknown) => ({ iteration_number, flags, fraud_signals: [] })
  const fixable = [{ id: 3, key: "stale_documents", axis: "confidence", severity: "major", type: "fixable", title: "t", remediation: "Upload a current statement." }]

  it("nothing queued reads as 'none', not a spinner", () => {
    expect(screenStatusView({ job: null, evaluation: null, maxIterations: 2 }).status).toBe("none")
  })
  it("a live job wins over an older evaluation (a re-check reads as processing)", () => {
    expect(screenStatusView({ job: job("pending"), evaluation: evaluation(1, fixable), maxIterations: 2 }).status).toBe("processing")
  })
  it("done carries the to-dos, and a re-check only while under the cap", () => {
    const v = screenStatusView({ job: job("done"), evaluation: evaluation(1, fixable), maxIterations: 2 })
    expect(v).toEqual({ status: "done", todos: [{ key: "stale_documents", title: "t", action: "Upload a current statement." }], canRecheck: true })
    expect(screenStatusView({ job: job("done"), evaluation: evaluation(2, fixable), maxIterations: 2 }).canRecheck).toBe(false)
  })
  it("no to-dos → no re-check offered", () => {
    expect(screenStatusView({ job: job("done"), evaluation: evaluation(1, []), maxIterations: 2 }).canRecheck).toBe(false)
  })
  it("an exhausted job with no evaluation is 'failed'", () => {
    expect(screenStatusView({ job: job("failed", 3), evaluation: null, maxIterations: 2 }).status).toBe("failed")
  })
  it("the view has exactly three keys — no tier, ratio or confidence can ride along", () => {
    expect(Object.keys(screenStatusView({ job: null, evaluation: evaluation(1, fixable), maxIterations: 2 })).sort()).toEqual(["canRecheck", "status", "todos"])
  })
})

describe("A18 wiring (source)", () => {
  const screen = src("app/api/applications/[id]/screen/route.ts")
  const submit = src("app/api/applications/[id]/submit/route.ts")
  const documents = src("app/api/applications/[id]/documents/route.ts")
  const actions = src("lib/applications/applicationActions.ts")
  const submitToAgent = src("app/api/applications/[id]/submit-to-agent/route.ts")
  const saveDraft = src("app/api/applications/save-draft/route.ts")
  const GUARD = `.not("stage1_status", "in", STAGE1_DECIDED_IN)`

  it("the decided set is the PostgREST operand the writers use", () => {
    expect(STAGE1_DECIDED_IN).toBe("(shortlisted,not_shortlisted)")
  })

  it("every automated stage1_status write is guarded against demoting a decision", () => {
    for (const [name, text] of [["screen", screen], ["submit", submit], ["documents", documents]] as const) {
      const writes = text.match(/stage1_status: "[a-z_]+"[^)]*\}\)\.eq\("id", [a-zA-Z]+\)[^\n]*/g) ?? []
      expect(writes.length, name).toBeGreaterThan(0)
      for (const w of writes) expect(w, name).toContain(GUARD)
    }
    // save-draft's documents_submitted is its own guarded write, never folded into the draft update.
    expect(saveDraft).not.toContain("updateFields.stage1_status")
    expect(saveDraft).toMatch(/update\(\{ stage1_status: "documents_submitted" \}\)\s*\.eq\("id", body\.applicationId\)\.not\("stage1_status", "in", STAGE1_DECIDED_IN\)/)
  })

  it("GET /screen reads only what the to-dos need, and answers only with screenStatusView (an allowlist)", () => {
    const get = screen.slice(screen.indexOf("export async function GET"))
    expect(get.match(/\.select\("[^"]*"\)/g)).toEqual([
      `.select("status, attempts, max_attempts")`,
      `.select("iteration_number, flags, fraud_signals")`,
    ])
    // Every way out of GET: NextResponse.json, Response.json or new Response. Each must be an error, the 503, or the view.
    const exits = get.split("\n").filter((l) => /Response\.json\(|new Response\(/.test(l))
    expect(exits.length).toBeGreaterThan(0)
    for (const line of exits) {
      expect(line).toMatch(/NextResponse\.json\((\{ error: |\{ status: "unavailable" \}|screenStatusView\()/)
      expect(line).not.toMatch(/(?<!Next)Response\.json\(|new Response\(/)
    }
  })

  it("review open, submit-to-agent, re-check and shortlist each reach enqueueScreening", () => {
    expect(submit).toMatch(/enqueueScreening\(service, \{ orgId, applicationId: id \}\)/)
    expect(submit).toContain("app.stage1_consent_given === true")
    expect(submitToAgent).toMatch(/enqueueScreening\(service, \{ orgId: app\.org_id as string, applicationId: id \}\)/)
    expect(screen).toMatch(/enqueueScreening\(db, \{ orgId: args\.orgId, applicationId: args\.applicationId, force: true \}\)/)
    expect(actions).toMatch(/enqueueScreening\(db, \{ orgId, applicationId \}\)/)
    expect(src("lib/screening/sendShortlistInvitation.ts")).toMatch(/enqueueScreening\(db, \{ orgId, applicationId \}\)/)
    // A finished pass queues its own follow-up when documents changed while it ran (walker N1).
    expect(screen).toMatch(/status: "done", iteration_number: iteration[^\n]*\n\s*await requeueIfDocsChanged\(db, app\.org_id, id\)/)
  })

  it("the claimer takes the oldest job — the one the race dedupe keeps (walker N4)", () => {
    expect(screen).toMatch(/async function claimJob[\s\S]{0,700}\.order\("created_at", \{ ascending: true \}\)/)
  })

  it("the retry cron excludes exhausted jobs in the query, so they cannot fill every batch (walker N3)", () => {
    const cron = src("app/api/cron/screening-jobs/route.ts")
    expect(cron).toMatch(/\.in\("status", \["pending", "failed"\]\)\.lt\("attempts", JOB_MAX_ATTEMPTS_DEFAULT\)/)
    expect(cron).toContain(`error: "no live application token"`)
  })

  it("a re-check is refused once the application is submitted", () => {
    expect(screen).toMatch(/if \(args\.submittedAt\) return NextResponse\.json\(\{ error: "Already submitted" \}, \{ status: 409 \}\)/)
  })
})
