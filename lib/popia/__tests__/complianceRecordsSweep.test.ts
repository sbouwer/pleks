import { describe, it, expect } from "vitest"
import { complianceRecordsSweep, type SweepResult } from "../complianceRecordsSweep"
import { F3_TIER_2_FINAL_STRIP_COLUMNS, F3_TIER_2_RETAINED_COLUMNS } from "../anonymisePlan"
import { retentionDisplay } from "../retention"

type Db = Parameters<typeof complianceRecordsSweep>[0]

describe("F3 5y compliance sweep — strip-set composition (§6.5)", () => {
  it("nulls the accountability columns but PRESERVES the bare terminal outcome (status)", () => {
    expect(F3_TIER_2_FINAL_STRIP_COLUMNS).not.toContain("status")           // shell keeps the outcome
    for (const col of ["decided_at", "decline_reason_code", "adverse_factor_codes", "fitscore",
      "fitscore_inputs_hash", "decline_reason_text", "rent_to_income_ratio_at_decision",
      "criminal_screening_policy_id", "screening_policy_id"]) {
      expect(F3_TIER_2_FINAL_STRIP_COLUMNS, col).toContain(col)
    }
  })

  it("the final retained set includes the pass-4/6 fields (ratios + policy linkage + inputs hash)", () => {
    const r = F3_TIER_2_RETAINED_COLUMNS.applications
    for (const col of ["fitscore_inputs_hash", "dti_ratio_at_decision", "criminal_screening_policy_version",
      "screening_policy_version", "income_verification_status_at_decision"]) {
      expect(r.has(col), col).toBe(true)
    }
  })
})

describe("F3 retention SSOT — the two 5y categories", () => {
  it("declined_decision_record + consent_proof resolve to a retention window (union + PLATFORM_DEFAULTS wired)", () => {
    expect(retentionDisplay("declined_decision_record")).toBeTruthy()
    expect(retentionDisplay("consent_proof")).toBeTruthy()
  })
})

/**
 * Table-aware mock. from(table) returns a fresh chain; awaiting it yields { data, error } (data depends on
 * whether .update() was called); .maybeSingle() yields the resolve row. stripGroup, claimApplicantPurgeSlot,
 * isOnHold, resolveSubjectAuthUserId, recordAudit all run for real against this.
 */
function makeSweepDb(opts: {
  decRows: unknown[]; cvRows: unknown[]; tenantId: string | null; authUserId: string | null; holdRows: unknown[]
}): Db {
  const from = (table: string) => {
    let updated = false
    const c: Record<string, unknown> = {}
    const self = () => c
    for (const m of ["select", "not", "lt", "or", "eq", "order", "insert"]) c[m] = self
    c.update = () => { updated = true; return c }
    const singleRow = () => {
      if (table === "tenants") return { auth_user_id: opts.authUserId }
      if (table === "applications") return { tenant_id: opts.tenantId }
      return null
    }
    c.maybeSingle = () => Promise.resolve({ data: singleRow(), error: null })
    Object.defineProperty(c, "data", {
      get: () => {
        if (updated) return [{ id: "stripped" }]            // stripGroup's RETURNING select
        if (table === "applications") return opts.decRows    // declined candidate fetch
        if (table === "consent_verifications") return opts.cvRows
        if (table === "legal_hold_events") return opts.holdRows
        return []
      },
    })
    c.error = null
    return c
  }
  return { from } as unknown as Db
}

const NOW = new Date("2026-06-15T00:00:00.000Z")
const placedHold = [{ id: "h1", event_type: "hold_placed", lift_event_id: null, scope_type: "application", scope_id: "app-1" }]

describe("F3 5y compliance sweep — gate behaviour", () => {
  it("sweeps a declined-decision record past 5y when no hold is active", async () => {
    const db = makeSweepDb({
      decRows: [{ id: "app-1", org_id: "org-1", tenant_id: "t-1" }],
      cvRows: [], tenantId: "t-1", authUserId: "sub-1", holdRows: [],
    })
    const r: SweepResult = await complianceRecordsSweep(db, NOW)
    expect(r.declined_decision_record.swept).toBe(1)
    expect(r.declined_decision_record.skipped_on_hold).toBe(0)
  })

  it("suspends the 5y strip when an application hold is active (skipped_on_hold)", async () => {
    const db = makeSweepDb({
      decRows: [{ id: "app-1", org_id: "org-1", tenant_id: "t-1" }],
      cvRows: [], tenantId: "t-1", authUserId: "sub-1", holdRows: placedHold,
    })
    const r = await complianceRecordsSweep(db, NOW)
    expect(r.declined_decision_record.swept).toBe(0)
    expect(r.declined_decision_record.skipped_on_hold).toBe(1)
  })

  it("strips consent contact-PII past 5y when clear; subject-missing (null application_id) is held, not swept", async () => {
    const swept = await complianceRecordsSweep(makeSweepDb({
      decRows: [], cvRows: [{ id: "cv-1", org_id: "org-1", application_id: "app-1" }], tenantId: "t-1", authUserId: "sub-1", holdRows: [],
    }), NOW)
    expect(swept.consent_proof.swept).toBe(1)

    const orphan = await complianceRecordsSweep(makeSweepDb({
      decRows: [], cvRows: [{ id: "cv-2", org_id: "org-1", application_id: null }], tenantId: null, authUserId: null, holdRows: [],
    }), NOW)
    expect(orphan.consent_proof.swept).toBe(0)
    expect(orphan.consent_proof.skipped_on_hold).toBe(1)   // subject_missing → held for IO review
  })
})
