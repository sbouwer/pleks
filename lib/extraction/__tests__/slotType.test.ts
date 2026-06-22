import { describe, it, expect } from "vitest"
import { slotTypeForFilename, extractionMatchesSlot } from "../slotType"

describe("slotTypeForFilename — trust the upload slot", () => {
  it("maps single-upload slots (filename = key)", () => {
    expect(slotTypeForFilename("id.pdf")).toBe("id-document")
    expect(slotTypeForFilename("employment_letter.pdf")).toBe("employer-letter")
  })
  it("maps multi-upload slots (key_id.ext)", () => {
    expect(slotTypeForFilename("payslips_a1b2c3.pdf")).toBe("payslip")
    expect(slotTypeForFilename("bank_main_9f8e.pdf")).toBe("bank-statement")
    expect(slotTypeForFilename("bank_savings_77.pdf")).toBe("savings-account-details")
  })
  it("leaves the free-form 'other' slot unmapped (still classified)", () => {
    expect(slotTypeForFilename("other_xyz.pdf")).toBeUndefined()
    expect(slotTypeForFilename("random.pdf")).toBeUndefined()
  })
})

describe("extractionMatchesSlot — the skip-classification guardrail", () => {
  it("flags a non-ID dropped in the ID slot (extractor reports document_type 'other')", () => {
    expect(extractionMatchesSlot("id-document", { document_type: "other", extraction_confidence: 0.9 } as never, 0.9)).toBe(false)
  })
  it("accepts a real ID", () => {
    expect(extractionMatchesSlot("id-document", { document_type: "sa-smart-id", extraction_confidence: 0.9 } as never, 0.9)).toBe(true)
  })
  it("flags a low-confidence extraction in a non-ID slot (likely wrong doc)", () => {
    expect(extractionMatchesSlot("bank-statement", { extraction_confidence: 0.2 }, 0.2)).toBe(false)
  })
  it("accepts a confident extraction in a non-ID slot", () => {
    expect(extractionMatchesSlot("bank-statement", { extraction_confidence: 0.8 }, 0.8)).toBe(true)
  })
  it("flags a null extraction (nothing read)", () => {
    expect(extractionMatchesSlot("payslip", null, undefined)).toBe(false)
  })
})
