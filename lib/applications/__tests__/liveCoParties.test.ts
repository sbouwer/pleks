/**
 * lib/applications/__tests__/liveCoParties.test.ts — the live-co set, and that every party-set reader takes it (N3)
 *
 * Notes:  The census is over SOURCE, as the DSAR follow-up 2 tests are: the readers are wired into routes and crons
 *         whose fakes cannot all see a missing `.neq`. A new inline spelling of the erased half fails here, so the
 *         rule stays in one place.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { ANONYMISE_PLAN, REDACTED } from "@/lib/popia/anonymisePlan"
import { isLiveCoParty, onlyLiveCoParties } from "../liveCoParties"

/** A builder that records the filters applied to it, each returning itself as PostgREST's do. */
function recorder() {
  const calls: Array<[string, string, unknown]> = []
  const b = {
    is(c: string, v: unknown) { calls.push(["is", c, v]); return b },
    neq(c: string, v: unknown) { calls.push(["neq", c, v]); return b },
  }
  return { b, calls }
}

describe("onlyLiveCoParties / isLiveCoParty", () => {
  const erasedRow = () => ({ declined_at: null, applicant_email: "co@example.test", ...ANONYMISE_PLAN.find((g) => g.id === "C.application_co_applicants.self")!.fields })

  it("narrows a query by both halves and returns the same builder", () => {
    const { b, calls } = recorder()
    expect(onlyLiveCoParties(b)).toBe(b)
    expect(calls).toEqual([["is", "declined_at", null], ["neq", "applicant_email", REDACTED]])
  })

  it("the row the erasure plan leaves is not live — its declined_at is still null, which is the whole defect", () => {
    const row = erasedRow()
    expect(row.declined_at).toBeNull()
    expect(row.applicant_email).toBe(REDACTED)
    expect(isLiveCoParty(row)).toBe(false)
  })

  it("a declined party is not live; an ordinary one is", () => {
    expect(isLiveCoParty({ declined_at: "2026-10-05T00:00:00Z", applicant_email: "co@example.test" })).toBe(false)
    expect(isLiveCoParty({ declined_at: null, applicant_email: "co@example.test" })).toBe(true)
  })
})

describe("every reader of the live party set takes the shared filter (source)", () => {
  const root = process.cwd()
  const src = (p: string) => readFileSync(join(root, p), "utf8")

  // Each reads "the parties still in this application". The ones that must NOT take it (erasure, export, audit, the
  // agent's historical roster) are named in the module's header.
  const READERS = [
    "lib/applications/peerEmails.ts",
    "lib/applications/peerCompletion.ts",
    "lib/applications/commercial.ts",
    "lib/screening/milestoneNotices.ts",
    "lib/screening/screeningConsent.ts",
    "lib/screening/maybeRunOrchestrator.ts",
    "lib/screening/sendShortlistInvitation.ts",
    "app/api/applications/[id]/screen/route.ts",
    "app/api/applications/[id]/submit-to-agent/route.ts",
    // These two load the row and decide in memory: the cron must still settle an erased line at its deadline (walker
    // F1), and the FitScore roster must still COUNT an erased party while never scoring it.
    "app/api/cron/screening-portal-reminders/route.ts",
    "lib/screening/assessedWith.ts",
  ]

  it.each(READERS)("%s", (file) => {
    expect(src(file)).toMatch(/\b(?:onlyLiveCoParties|isLiveCoParty)\(/)
  })

  it("no source file spells the erased half inline any more — the helper is its one home", () => {
    const inline = /\.neq\(\s*"applicant_email"\s*,\s*REDACTED\s*\)/
    const hits: string[] = []
    for (const dir of ["lib", "app"]) {
      for (const rel of readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })) {
        const p = join(dir, rel).replace(/\\/g, "/")
        if (!/\.tsx?$/.test(p) || /(?:__tests__|\.test\.tsx?$)/.test(p) || p === "lib/applications/liveCoParties.ts") continue
        if (inline.test(src(p))) hits.push(p)
      }
    }
    expect(hits).toEqual([])
  })
})
