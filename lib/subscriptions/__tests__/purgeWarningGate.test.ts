/**
 * lib/subscriptions/__tests__/purgeWarningGate.test.ts — M-074 probes
 *
 * The register names four directions and they are the minimum here: a purge with the warning
 * delivered must PROCEED, one without must DEFER, a deferral must carry a reason an operator can
 * act on, and the no-contact deferral must be DISTINGUISHABLE from the send-failure one.
 *
 * The fourth is the one worth the file. Before this gate both cases fell through the same
 * `.catch(console.error)` and were indistinguishable in every artefact the system produced — and
 * they need opposite responses (find the org a contact vs. investigate why mail is failing).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { classifyPurgeWarning } from "../purgeWarningGate"

describe("classifyPurgeWarning — the PROCEED direction", () => {
  // `sent` is the bar, not `delivered`. Requiring a Resend webhook confirmation would hang every
  // purge forever wherever the webhook is not wired, and indefinite retention is its own POPIA
  // s14 breach — the failure here is symmetrical, so "fail closed" is not automatically safe.
  it.each(["sent", "delivered", "opened", "unsubscribed"])(
    "proceeds when the warning status is %s",
    (status) => {
      expect(classifyPurgeWarning({ status }, true)).toEqual({ ok: true, status })
    },
  )

  it("proceeds on a delivered warning even when the org has no contact TODAY", () => {
    // A logged send proves a contact existed when it mattered. Re-deriving that from today's org
    // state would defer orgs that were properly warned and have since lost their admin.
    expect(classifyPurgeWarning({ status: "delivered" }, false)).toEqual({ ok: true, status: "delivered" })
  })
})

describe("classifyPurgeWarning — the DEFER direction", () => {
  it("defers when no warning was ever logged", () => {
    expect(classifyPurgeWarning(null, true).ok).toBe(false)
  })

  it("defers when the warning affirmatively failed", () => {
    expect(classifyPurgeWarning({ status: "failed" }, true).ok).toBe(false)
  })

  it("defers when the warning bounced", () => {
    expect(classifyPurgeWarning({ status: "bounced" }, true).ok).toBe(false)
  })

  // THE FAIL-CLOSED CASE. A status this gate does not recognise must never read as delivery —
  // that is the whole M-074 class, where a value standing in for an unknown gets treated as an
  // answer. A new Resend event type must widen the set deliberately, not open the gate silently.
  it("defers on a status it does not recognise rather than assuming delivery", () => {
    expect(classifyPurgeWarning({ status: "queued" }, true)).toEqual({ ok: false, reason: "not_delivered" })
    expect(classifyPurgeWarning({ status: "" }, true).ok).toBe(false)
    expect(classifyPurgeWarning({ status: null }, true).ok).toBe(false)
  })
})

describe("classifyPurgeWarning — the reasons stay distinguishable", () => {
  it("separates no-contact from no-warning-logged, both of which are 'no row'", () => {
    // Same absent row, two different jobs for a human. Collapsing them is the defect the entry
    // records at the call site: both used to reach the same console.error and stop there.
    expect(classifyPurgeWarning(null, false)).toEqual({ ok: false, reason: "no_contact" })
    expect(classifyPurgeWarning(null, true)).toEqual({ ok: false, reason: "no_warning_logged" })
  })

  it("separates a send failure from an absent warning", () => {
    expect(classifyPurgeWarning({ status: "failed" }, true)).toEqual({ ok: false, reason: "send_failed" })
    expect(classifyPurgeWarning(null, true)).toEqual({ ok: false, reason: "no_warning_logged" })
  })

  it("every deferral carries a reason — no deferral is unattributed", () => {
    const deferrals = [
      classifyPurgeWarning(null, false),
      classifyPurgeWarning(null, true),
      classifyPurgeWarning({ status: "failed" }, true),
      classifyPurgeWarning({ status: "bounced" }, true),
      classifyPurgeWarning({ status: "queued" }, true),
    ]
    for (const d of deferrals) {
      expect(d.ok).toBe(false)
      if (!d.ok) expect(d.reason).toBeTruthy()
    }
    // …and the reasons are actually distinct values, not one reason wearing several names.
    const reasons = new Set(deferrals.map((d) => (d.ok ? "" : d.reason)))
    expect(reasons.size).toBe(4)
  })

  // The CHECK constraint in 010_platform_features.sql enumerates these four. A fifth reason added
  // in TypeScript without amending the migration would fail at INSERT time, in a nightly cron, on
  // the POPIA path — this pins the two together where it is cheap to notice.
  //
  // The allowed set is READ FROM THE MIGRATION, not restated here. A copy would drift silently and
  // then agree with itself, which is the failure this test exists to prevent.
  it("emits only reasons the subscriptions CHECK constraint accepts", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../../supabase/migrations/010_platform_features.sql"),
      "utf8",
    )
    const clause = /subscriptions_purge_deferred_reason_check[\s\S]*?IN \(([^)]*)\)/.exec(sql)
    expect(clause, "the CHECK constraint was not found — the migration moved or was renamed").toBeTruthy()
    const allowed = new Set(
      (clause?.[1] ?? "").split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean),
    )
    // A regex that matched but captured nothing would make every assertion below vacuous.
    expect(allowed.size).toBe(4)

    const produced = [
      classifyPurgeWarning(null, false),
      classifyPurgeWarning(null, true),
      classifyPurgeWarning({ status: "failed" }, true),
      classifyPurgeWarning({ status: "queued" }, true),
    ]
    for (const p of produced) {
      if (!p.ok) expect(allowed.has(p.reason)).toBe(true)
    }
  })
})
