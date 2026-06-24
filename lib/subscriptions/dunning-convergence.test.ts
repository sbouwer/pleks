/**
 * lib/subscriptions/dunning-convergence.test.ts — ADDENDUM_57H regression guard
 *
 * Notes:  Locks the non-payment convergence (57H, enforcing the 57G canon): the ONLY automated
 *         non-payment transition is `past_due → paused`. billing-cascade is detector-only; the
 *         `past_due → cancelled` transition + `account_frozen`/"frozen"/"suspended" vocabulary are
 *         retired. These are source-invariant assertions (the cron has no runnable harness yet — the
 *         full integration test folds into the still-open 57G Step 11 work; see INDEX).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")

describe("ADDENDUM_57H — non-payment converges on paused (57G canon)", () => {
  const billingCascade = read("app/api/cron/billing-cascade/route.ts")
  const emails = read("lib/subscriptions/emails.tsx")
  const registry = read("lib/comms/template-registry.ts")

  it("the source files under test are present + substantive (so the not.toContain negatives aren't vacuous)", () => {
    // A source-grep stopgap (no runnable cron harness yet): a missing file throws at read, but a GUTTED file would
    // make every not.toContain/not.toMatch pass for the wrong reason. Anchor each on a known positive marker.
    expect(billingCascade).toContain("past_due_since")   // billing-cascade is the real detector
    expect(emails).toContain("sendPausedAuto")           // emails is the real subscription module
    expect(registry).toContain("subscription.")          // registry holds the subscription keys
  })

  it("billing-cascade is detector-only: no automated past_due → cancelled transition", () => {
    // 57G sanctions exactly one automated non-payment transition (past_due → paused, owned by dunning).
    expect(billingCascade).not.toMatch(/status:\s*["']cancelled["']/)
    expect(billingCascade).not.toContain("sendAccountFrozen")
    expect(billingCascade).not.toContain("sendPaymentFailed")
    expect(billingCascade).not.toContain("sendPaymentReminder")
  })

  it("billing-cascade feeds the single ladder: sets past_due_since on silent lapse", () => {
    expect(billingCascade).toContain("past_due_since")
    expect(billingCascade).toMatch(/status:\s*["']past_due["']/)
  })

  it("sendAccountFrozen is deleted (the account_frozen fold resolves by deletion)", () => {
    expect(emails).not.toContain("sendAccountFrozen")
  })

  it("no 'frozen'/'suspended' vocabulary survives in subscription emails (D-57H-02)", () => {
    expect(emails).not.toMatch(/frozen/i)
    expect(emails).not.toMatch(/suspended/i)
  })

  it("the converged terminal sender (paused_auto) is retained", () => {
    expect(emails).toContain("sendPausedAuto")
  })

  it("the subscription.account_frozen registry key is removed", () => {
    expect(registry).not.toContain('"subscription.account_frozen"')
  })

  it("the dunning cron drives the ladder through the canonical resolveDunningLadderStep (not inline day-math)", () => {
    const dunning = read("app/api/cron/subscription-dunning/route.ts")
    expect(dunning).toContain("resolveDunningLadderStep")
    // the auto-pause branch keys off the resolved step, not a raw day comparison
    expect(dunning).toContain('ladderStep === "auto_pause"')
  })
})
