/**
 * applySaveDraft.test.ts — the co save body assembly (ADDENDUM_14R Phase 2, sub-step 2).
 *
 * Proves assembleCoSaveBody mirrors the lead's affordability inputs (income → gross, commitments − school fees →
 * obligations), carries the finances in section_data, flips consent (sign-off) vs draft (autosave), and links a
 * spouse who is the lead by id_number (symmetric s15).
 */
import { describe, it, expect } from "vitest"
import { assembleCoSaveBody } from "./applySaveDraft"
import type { Emp, IncomeRow, CoApplicant } from "./applyDomain"
import type { PartyFormState } from "@/lib/parties/partyValidation"

const emp: Emp = { employment_type: "permanent", employer: "Acme", start_date: "2020-01-01" }
const income: IncomeRow[] = [{ key: "salary", label: "Salary", amount: "20000", period: "month" }]
const commitments: IncomeRow[] = [
  { key: "loan", label: "Loan", amount: "3000", period: "month" },
  { key: "school_fees", label: "School fees", amount: "2000", period: "month" },
]
function form(over: Partial<PartyFormState> = {}): PartyFormState {
  return { firstName: "Co", lastName: "Peer", idType: "sa_id", idNumber: "9001015800089", dob: "1990-01-01", addresses: [{ line1: "1 Main" }], ...over } as PartyFormState
}
const base = { form: form(), emp, dependentAdults: "1", dependentMinors: "2", income, commitments, spouseCandidates: [] as CoApplicant[] }

describe("assembleCoSaveBody", () => {
  it("autosave → draft:true (no consent); sign-off → consent:true (no draft)", () => {
    const draft = assembleCoSaveBody({ ...base, final: false })
    expect(draft.draft).toBe(true)
    expect("consent" in draft).toBe(false)
    const fin = assembleCoSaveBody({ ...base, final: true })
    expect(fin.consent).toBe(true)
    expect("draft" in fin).toBe(false)
  })

  it("income → gross; commitments minus school fees → declared obligations (lead parity)", () => {
    const b = assembleCoSaveBody({ ...base, final: true })
    expect(b.grossMonthlyIncomeCents).toBe(20_000_00)
    expect(b.declaredMonthlyObligationsCents).toBe(3_000_00) // (3000 + 2000) − 2000 school fees
  })

  it("section_data carries employment / income / expenses / dependants", () => {
    const sd = assembleCoSaveBody({ ...base, final: false }).sectionData as Record<string, unknown>
    expect((sd.employment_details as Emp).employer).toBe("Acme")
    expect(sd.income_sources as unknown[]).toHaveLength(1)
    expect(sd.expenses as unknown[]).toHaveLength(2)
    expect((sd.dependants as { adults: number; minors: number }).adults).toBe(1)
    expect((sd.dependants as { adults: number; minors: number }).minors).toBe(2)
  })

  it("links a spouse who is the lead by id_number (symmetric s15)", () => {
    const lead: CoApplicant = { firstName: "Lead", lastName: "One", email: "lead@x.com", phone: "", idNumber: "8505050050081", role: "co_applicant", invited: true }
    const b = assembleCoSaveBody({
      ...base,
      form: form({ maritalStatus: "married", matrimonialRegime: "in_community", spouseIsCoApplicant: true, spouseEmail: "lead@x.com" }),
      spouseCandidates: [lead], final: true,
    })
    expect(b.spouseInfo).toMatchObject({ isCoApplicant: true, idNumber: "8505050050081" })
  })

  it("no spouse link when not married in community", () => {
    expect(assembleCoSaveBody({ ...base, final: true }).spouseInfo).toBeNull()
  })
})
