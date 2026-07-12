/**
 * lib/actions/__tests__/leaseForm.ablation.test.ts — FIELD ABLATION on the lease WIZARD
 *
 * The import ablation harness (test/db/import-ablation.dbtest.ts) found three statutory/money terms that a
 * missing column silently overwrote. The wizard writes the SAME columns through a different door —
 * `parseLeaseFormData` — and had none of that scaffolding. So point the harness at it.
 *
 * The invariant, restated for a pure parser:
 *
 *     A value the agency STATED must survive — including when they stated ZERO.
 *     A value the agency did NOT state must not silently become a money term they never chose.
 *
 * `|| default` breaks the first rule BY CONSTRUCTION: in JavaScript 0 is falsy, so a lease with 0% escalation,
 * 0 notice days, or a 0% arrears margin has its OWN STATED VALUE thrown away and replaced by the default.
 * That is not a fallback — it is an override, and it moves money.
 */
import { describe, it, expect } from "vitest"
import { parseLeaseFormData } from "../leases"

/** The control: every value deliberately DIFFERENT from its default — including the legitimate ZEROS.
 *  (A fixture that agrees with the fallback cannot see the fallback — the lesson from the import harness.) */
function controlForm(): FormData {
  const f = new FormData()
  f.set("unit_id", "u1")
  f.set("property_id", "p1")
  f.set("tenant_id", "t1")
  f.set("lease_type", "commercial")            // default "residential"
  f.set("cpa_applies", "false")                // default true
  f.set("is_fixed_term", "false")              // default true
  f.set("start_date", "2026-03-01")
  f.set("end_date", "2027-02-28")
  f.set("rent_amount", "6600.50")
  f.set("notice_period_days", "30")            // default 20
  f.set("payment_due_day", "5")                // default "1"
  f.set("escalation_percent", "0")             // a REAL choice: this lease does not escalate
  f.set("escalation_type", "cpi")              // default "fixed"
  f.set("deposit_amount", "13201")
  f.set("deposit_interest_to", "landlord")
  f.set("arrears_interest_enabled", "false")   // default true
  f.set("arrears_interest_margin", "0")        // a REAL choice: this agency charges no margin
  return f
}

describe("lease wizard — a stated value must survive, including ZERO", () => {
  it("0% escalation stays 0% — `|| 10` throws the agency's own choice away", () => {
    // A lease that says "the rent does not escalate" is ordinary. `parseFloat("0") || 10` is 10 — so the
    // tenant's rent silently rises 10% a year, compounding, on a lease that says it does not rise at all.
    expect(parseLeaseFormData(controlForm()).escalationPercent, "a stated 0% must not become 10%").toBe(0)
  })

  it("a 0% arrears margin stays 0% — an agency charges what it says it charges", () => {
    expect(parseLeaseFormData(controlForm()).arrearsInterestMarginPercent, "a stated 0% must not become 2%").toBe(0)
  })

  it("a 0-day notice period is not silently 20", () => {
    const form = controlForm()
    form.set("notice_period_days", "0")
    expect(parseLeaseFormData(form).noticePeriod).toBe(0)
  })

  it("ABLATION: an UPLOADED lease must not silently switch arrears interest ON", () => {
    // buildUploadedFormData (CreateStep.tsx) calls only appendCommonFields — it never sets
    // arrears_interest_enabled or the margin. `!== "false"` then reads ABSENT as TRUE and `|| 2` supplies a 2%
    // margin. So uploading an existing lease silently starts charging the tenant prime+2% arrears interest
    // that nobody chose, on a document Pleks did not even generate.
    const form = controlForm()
    form.delete("arrears_interest_enabled")
    form.delete("arrears_interest_margin")

    const f = parseLeaseFormData(form)
    expect(f.arrearsInterestEnabled, "silence is not consent to charge interest").toBe(false)
    expect(f.arrearsInterestMarginPercent, "and certainly not at a rate nobody chose").toBe(0)
  })
})
