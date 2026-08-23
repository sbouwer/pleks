/**
 * lib/cron/__tests__/cronDigest.test.ts — M-074 part 3: a deferral must RAISE an item
 *
 * The digest is failure-only by design ("no news is good news"), which is exactly why a deferral
 * had to be added to its vocabulary rather than left to the status field. A held-back purge leaves
 * every other signal green: the job returns ok, nothing errored, no email failed. If isIssue does
 * not name it, the run is silent and the deferral is invisible in every surface the system has.
 */
import { describe, it, expect } from "vitest"
import { isIssue } from "../cronDigest"

describe("isIssue — a deferral raises an item", () => {
  it("flags a job that ran fine but held work back", () => {
    expect(isIssue({ status: "ok", sent: 3, failed: 0, deferred: 1 })).toBe(true)
  })

  it("flags it even when nothing else is remotely wrong", () => {
    // The whole point: this row is green on every other axis a reader looks at.
    expect(isIssue({ status: "ok", deferred: 2 })).toBe(true)
  })
})

describe("isIssue — the quiet direction still holds", () => {
  // Without this half, "return true always" scores green above and the digest emails on every
  // clean run — which is how a failure-only channel gets muted by the person receiving it.
  it("stays silent on a clean run", () => {
    expect(isIssue({ status: "ok", sent: 5, failed: 0 })).toBe(false)
    expect(isIssue({ status: "ok" })).toBe(false)
    expect(isIssue({ status: "ok", deferred: 0 })).toBe(false)
  })

  it("does not treat a skip as an issue", () => {
    expect(isIssue({ status: "skipped (not the 1st)" })).toBe(false)
  })
})

describe("isIssue — the pre-existing signals are unchanged", () => {
  it.each(["failed", "error", "partial"])("still flags status=%s", (status) => {
    expect(isIssue({ status })).toBe(true)
  })

  it("still flags failed sends on an otherwise-ok job", () => {
    expect(isIssue({ status: "ok", sent: 1, failed: 2 })).toBe(true)
  })
})
