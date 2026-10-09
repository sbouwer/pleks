/**
 * lib/screening/__tests__/assessedWith.test.ts — the FitScore is computed on the completed parties and stamped "N of M"
 *
 * Notes:  ADDENDUM_14X rows 35–36, probed both directions. Planted: a live co whose line has not completed is NOT scored
 *         but IS counted; a declined co is counted and not scored, whatever its reason (walker 14x-p3 F2: M fails toward
 *         "incomplete"). Known-good: a fully completed roster stamps N = M. Then the orchestrator wire: what the engine
 *         was handed, what the snapshot persists, and that a stamp-only difference patches the snapshot ALONE — no
 *         status, narrative or rescore (walker 14x-p3 F1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  readAssessedWith, sameAssessedWith, screeningRoster, stampAssessedWith, type RosterCoRow,
} from "../assessedWith"
import { assessedWithLine } from "@/lib/reports/screening/_primitives/theme"
import { REDACTED } from "@/lib/popia/anonymisePlan"

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()), optionalEnv: () => "1", gitCommitSha: () => "test-sha",
}))
vi.mock("@/lib/screening/consentGuard", () => ({ assertScreeningConsent: async () => undefined }))
vi.mock("@/lib/screening/fitScoreNarrative", () => ({
  CURRENT_PROMPT_VERSION: "narr.test",
  generateFitScoreNarrative: async () => ({ isTemplated: false }),
}))
vi.mock("@/lib/comms/send-email", () => ({ fetchOrgSettings: async () => null, buildBranding: () => ({}) }))
vi.mock("@/lib/applications/emails", () => ({ sendScreeningComplete: async () => undefined }))
vi.mock("@/lib/auth/userEmail", () => ({ getUserEmail: async () => null }))
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }))

const co = (id: string, over: Partial<RosterCoRow> = {}): RosterCoRow =>
  ({ id, declined_at: null, searchworx_check_status: "complete", ...over })

const LIVE_INCOMPLETE = co("co-running", { searchworx_check_status: "running" })
const EXPIRED = co("co-expired", { declined_at: "2026-10-15T08:00:00Z", searchworx_check_status: "ready_to_run" })
/** Declined with its line complete — still not scored, still one of the M. */
const DECLINED_COMPLETE = co("co-declined-complete", { declined_at: "2026-10-10T08:00:00Z" })

describe("screeningRoster + stampAssessedWith", () => {
  it("PLANTED: an incomplete live co and every declined co are counted, never scored", () => {
    const { completed, counted } = screeningRoster([co("co-done"), LIVE_INCOMPLETE, EXPIRED, DECLINED_COMPLETE])
    expect(completed.map(r => r.id)).toEqual(["co-done"])
    expect(counted).toBe(4)
    expect(stampAssessedWith("app-1", completed.map(r => r.id), counted))
      .toEqual({ n: 2, m: 5, completedSubjectIds: ["app-1", "co-done"] })
  })

  it("PLANTED (N3): an erased co whose line had completed is counted, never scored — its data is gone", () => {
    const erased = co("co-erased", { applicant_email: REDACTED })
    const { completed, counted } = screeningRoster([co("co-done"), erased])
    expect(completed.map(r => r.id)).toEqual(["co-done"])
    expect(stampAssessedWith("app-1", completed.map(r => r.id), counted))
      .toEqual({ n: 2, m: 3, completedSubjectIds: ["app-1", "co-done"] })
  })

  it("KNOWN-GOOD: every party completed → N = M, lead first", () => {
    const { completed, counted } = screeningRoster([co("co-1"), co("co-2")])
    expect(stampAssessedWith("app-1", completed.map(r => r.id), counted))
      .toEqual({ n: 3, m: 3, completedSubjectIds: ["app-1", "co-1", "co-2"] })
  })

  it("a sole applicant is 1 of 1", () => {
    expect(stampAssessedWith("app-1", [], 0)).toEqual({ n: 1, m: 1, completedSubjectIds: ["app-1"] })
  })

  it("refuses an N larger than M — never stamps a count it cannot be out of", () => {
    expect(() => stampAssessedWith("app-1", ["co-1", "co-2"], 1)).toThrow(/out of only 1/)
  })
})

describe("readAssessedWith / sameAssessedWith / assessedWithLine", () => {
  it("a pre-P3 snapshot carries no stamp, and the report claims nothing", () => {
    expect(readAssessedWith({ applicants: [] })).toBeNull()
    expect(readAssessedWith(null)).toBeNull()
    expect(assessedWithLine({ assessedWith: null })).toBeNull()
    expect(assessedWithLine({})).toBeNull()
  })

  it("round-trips a stored stamp and states it", () => {
    const stamp = { n: 2, m: 3, completedSubjectIds: ["app-1", "co-1"] }
    expect(readAssessedWith({ assessedWith: stamp })).toEqual(stamp)
    expect(assessedWithLine({ assessedWith: { n: 2, m: 3 } })).toBe("Assessed with 2 of 3 parties")
    expect(assessedWithLine({ assessedWith: { n: 1, m: 1 } })).toBe("Assessed with 1 of 1 party")
  })

  it("compares counts and parties", () => {
    const a = { n: 2, m: 3, completedSubjectIds: ["app-1", "co-1"] }
    expect(sameAssessedWith(a, { ...a, completedSubjectIds: ["app-1", "co-1"] })).toBe(true)
    expect(sameAssessedWith(a, { ...a, m: 2 })).toBe(false)
    expect(sameAssessedWith(a, { ...a, completedSubjectIds: ["app-1", "co-2"] })).toBe(false)
    expect(sameAssessedWith(a, null)).toBe(false)
  })
})

// ─── The orchestrator wire ──────────────────────────────────────────────────────

type Write = Record<string, unknown>

/** One application in org-A with a listing and the given co rows; captures the applications update and the co filters. */
function fakeDb(coRows: RosterCoRow[], stored: { hash?: string | null; snapshot?: unknown } = {}) {
  const writes: Write[] = []
  const coFilters: Record<string, unknown> = {}
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => {
        filters[c] = v
        if (table === "application_co_applicants") coFilters[c] = v
        return b
      }
      b.is = () => b
      b.in = () => b
      b.limit = () => b
      b.maybeSingle = async () => ({ data: null, error: null })
      b.order = async () => ({ data: coRows, error: null })
      b.single = async () => {
        if (table === "applications") return { data: {
          id: "app-1", org_id: "org-A", listing_id: "lst-1", unit_id: null, first_name: "Lead", last_name: "Party",
          applicant_email: "lead@example.test", applicant_nationality_type: "sa_citizen", is_foreign_national: false,
          gross_monthly_income_cents: 3_000_000, fitscore_inputs_hash: stored.hash ?? null,
          fitscore_component_snapshot: stored.snapshot ?? null,
        }, error: null }
        if (table === "listings") return { data: { asking_rent_cents: 900_000 }, error: null }
        return { data: null, error: { message: "not stubbed" } }
      }
      b.update = (patch: Write) => {
        writes.push(patch)
        const u: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => ok({ error: null }) }
        u.eq = () => u
        return u
      }
      return b
    },
  }
  return { db: db as never, writes, coFilters }
}

const coIncome = (r: RosterCoRow) => ({ ...r, id_type: "sa_id", gross_monthly_income_cents: 1_000_000 })

describe("runFitScoreOrchestrator — scores the completed, stamps N of M", () => {
  let run: typeof import("../fitScoreOrchestrator").runFitScoreOrchestrator
  beforeEach(async () => { ({ runFitScoreOrchestrator: run } = await import("../fitScoreOrchestrator")) })

  it("PLANTED: the engine never sees the incomplete or declined co; the snapshot says 2 of 5", async () => {
    const { db, writes, coFilters } = fakeDb([co("co-done"), LIVE_INCOMPLETE, EXPIRED, DECLINED_COMPLETE].map(coIncome))
    const out = await run("app-1", db)
    expect(out.ok).toBe(true)
    expect(coFilters).toMatchObject({ primary_application_id: "app-1", org_id: "org-A" })
    const snap = writes[0].fitscore_component_snapshot as { applicants: Array<{ id: string }>; assessedWith: unknown }
    expect(snap.applicants.map(a => a.id)).toEqual(["app-1", "co-done"])
    expect(snap.assessedWith).toEqual({ n: 2, m: 5, completedSubjectIds: ["app-1", "co-done"] })
  })

  it("KNOWN-GOOD: a fully completed roster is 3 of 3", async () => {
    const { db, writes } = fakeDb([co("co-1"), co("co-2")].map(coIncome))
    await run("app-1", db)
    expect((writes[0].fitscore_component_snapshot as { assessedWith: unknown }).assessedWith)
      .toEqual({ n: 3, m: 3, completedSubjectIds: ["app-1", "co-1", "co-2"] })
  })

  it("same inputs + same stamp → no write; same inputs + a stale or missing stamp → the snapshot ALONE is patched", async () => {
    const rows = [co("co-1"), EXPIRED].map(coIncome)
    const first = fakeDb(rows)
    await run("app-1", first.db)
    const hash = first.writes[0].fitscore_inputs_hash as string
    const snapshot = first.writes[0].fitscore_component_snapshot

    const again = fakeDb(rows, { hash, snapshot })
    await run("app-1", again.db)
    expect(again.writes).toEqual([])

    for (const stored of [{ applicants: [] }, { ...(snapshot as object), assessedWith: { n: 2, m: 2, completedSubjectIds: ["app-1", "co-1"] } }]) {
      const stale = fakeDb(rows, { hash, snapshot: stored })
      await run("app-1", stale.db)
      expect(stale.writes).toHaveLength(1)
      expect(Object.keys(stale.writes[0])).toEqual(["fitscore_component_snapshot"])
      expect((stale.writes[0].fitscore_component_snapshot as { assessedWith: unknown }).assessedWith)
        .toEqual({ n: 2, m: 3, completedSubjectIds: ["app-1", "co-1"] })
    }
  })
})
