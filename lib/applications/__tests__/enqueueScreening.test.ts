/**
 * lib/applications/__tests__/enqueueScreening.test.ts — enqueueScreening against a fake db: the preconditions
 * (consent, live token), the stale-document re-queue, and the post-insert dedupe that stops concurrent callers
 * stacking AI runs (A18 walker F2/F3; the race reproduced in .handoff/a18/scratch/enqueueRace.test.ts).
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/tier/getOrgTier", () => ({ getOrgTierCanonical: async () => "firm" }))
vi.mock("@/lib/tier/gates", () => ({ hasFeature: () => true }))

import { enqueueScreening } from "../screeningJobs"

interface Job { id: string; status: string; attempts: number; max_attempts: number; started_at?: string }
interface World { consent: boolean; token: boolean; evals: number; docsChanged: boolean; jobs: Job[]; orArgs: string[] }

/** Each awaited step yields a tick, so two Promise.all callers interleave the way two invocations would. */
function fakeDb(over: Partial<World> = {}) {
  const w: World = { consent: true, token: true, evals: 0, docsChanged: false, jobs: [], orArgs: [], ...over }
  let seq = 0
  const tick = () => new Promise((r) => setTimeout(r, 1))
  function builder(table: string) {
    let filteredByStatus = false
    let pendingInsert: Job | null = null
    let deleting = false
    let deleteId = ""
    const b: Record<string, unknown> = {}
    for (const m of ["select", "order", "limit", "gt", "not"]) b[m] = () => b
    b.or = (f: string) => { w.orArgs.push(f); return b }
    b.in = () => { filteredByStatus = true; return b }
    b.eq = (col: string, v: string) => {
      if (deleting && col === "id") { deleteId = v }
      return b
    }
    b.insert = (row: { status: string }) => { pendingInsert = { id: `j${++seq}`, status: row.status, attempts: 0, max_attempts: 3 }; return b }
    b.delete = () => { deleting = true; return b }
    b.single = async () => {
      await tick()
      if (pendingInsert) { w.jobs.push(pendingInsert); return { data: { id: pendingInsert.id }, error: null } }
      return { data: null, error: null }
    }
    b.maybeSingle = async () => {
      await tick()
      if (table === "applications") return { data: { stage1_consent_given: w.consent }, error: null }
      if (table === "application_tokens") return { data: w.token ? { token: "t" } : null, error: null }
      if (table === "screening_jobs" && filteredByStatus) {
        return { data: w.jobs.find((j) => j.status === "pending" || j.status === "running") ?? null, error: null }
      }
      return { data: w.jobs.at(-1) ?? null, error: null }
    }
    b.then = (res: (v: unknown) => void) => tick().then(() => {
      if (deleting) { w.jobs = w.jobs.filter((j) => j.id !== deleteId); return res({ error: null }) }
      if (table === "application_documents") return res({ count: w.docsChanged ? 1 : 0, error: null })
      return res({ data: w.evals ? [{ generated_at: "2026-10-06T10:00:00Z" }] : [], count: w.evals, error: null })
    })
    return b
  }
  return { db: { from: builder } as never, w }
}

const ARGS = { orgId: "o", applicationId: "a" }

describe("enqueueScreening", () => {
  it("concurrent callers leave exactly one live job", async () => {
    const { db, w } = fakeDb()
    const r = await Promise.all([enqueueScreening(db, ARGS), enqueueScreening(db, ARGS), enqueueScreening(db, ARGS)])
    expect(w.jobs).toHaveLength(1)
    expect(r.filter((x) => x === "queued")).toHaveLength(1)
    expect(r.filter((x) => x === "active")).toHaveLength(2)
  })

  it("queues nothing without stage-1 consent or a live token (a job nobody can run would read live forever)", async () => {
    for (const over of [{ consent: false }, { token: false }]) {
      const { db, w } = fakeDb(over)
      expect(await enqueueScreening(db, ARGS)).toBe("not-ready")
      expect(w.jobs).toHaveLength(0)
    }
  })

  it("an evaluated application is re-queued only when its documents changed", async () => {
    const done = { id: "j0", status: "done", attempts: 1, max_attempts: 3 }
    expect(await enqueueScreening(fakeDb({ evals: 1, jobs: [done] }).db, ARGS)).toBe("screened")
    expect(await enqueueScreening(fakeDb({ evals: 1, docsChanged: true, jobs: [done] }).db, ARGS)).toBe("queued")
    expect(await enqueueScreening(fakeDb({ evals: 1, jobs: [done] }).db, { ...ARGS, force: true })).toBe("queued")
  })

  it("'changed' is measured from when the pass READ the documents (its job's started_at), not when it wrote", async () => {
    // generated_at is 10:00 (fake); the pass claimed at 09:59 — a 09:59:30 upload must count as changed.
    const { db, w } = fakeDb({ evals: 1, jobs: [{ id: "j0", status: "done", attempts: 1, max_attempts: 3, started_at: "2026-10-06T09:59:00Z" }] })
    await enqueueScreening(db, ARGS)
    expect(w.orArgs).toEqual(["uploaded_at.gt.2026-10-06T09:59:00.000Z,deleted_at.gt.2026-10-06T09:59:00.000Z"])
  })
})
