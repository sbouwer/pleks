/**
 * reviewMasking.test.ts — the §5 masking SSOT (ADDENDUM_14R Phase 4). Agent sees all; a peer sees raw ID + bank
 * account masked and never the credit report.
 */
import { describe, it, expect } from "vitest"
import { maskBankAccount, maskForAudience, canSeeCredit } from "./reviewMasking"

describe("maskBankAccount", () => {
  it("shows last 4 only; handles short/blank", () => {
    expect(maskBankAccount("62012345678")).toBe("••••5678")
    expect(maskBankAccount("12 34 5678")).toBe("••••5678")
    expect(maskBankAccount("123")).toBe("••••")
    expect(maskBankAccount("")).toBe("—")
    expect(maskBankAccount(null)).toBe("—")
  })
})

describe("maskForAudience", () => {
  it("agent sees the raw value", () => {
    expect(maskForAudience("agent", "id_number", "9001015800089")).toBe("9001015800089")
    expect(maskForAudience("agent", "bank_account", "62012345678")).toBe("62012345678")
    expect(maskForAudience("agent", "id_number", null)).toBe("—")
  })
  it("a peer sees ID + bank account masked", () => {
    expect(maskForAudience("peer", "id_number", "9001015800089")).toContain("•")
    expect(maskForAudience("peer", "id_number", "9001015800089")).not.toBe("9001015800089")
    expect(maskForAudience("peer", "bank_account", "62012345678")).toBe("••••5678")
    expect(maskForAudience("peer", "id_number", null)).toBe("—")
  })
})

describe("canSeeCredit", () => {
  it("only the agent may see the credit/bureau report", () => {
    expect(canSeeCredit("agent")).toBe(true)
    expect(canSeeCredit("peer")).toBe(false)
  })
})
