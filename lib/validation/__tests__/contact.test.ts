import { describe, it, expect } from "vitest"
import { isValidEmail, checkPhone, normalizePhone, formatPhone, isValidCipcReg, emailError, phoneError } from "@/lib/validation/contact"

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    for (const e of ["jane@example.co.za", "a.b-c+tag@sub.domain.com", "x@y.io"]) expect(isValidEmail(e)).toBe(true)
  })
  it("rejects missing @, missing dot/TLD, and spaces", () => {
    for (const e of ["jane.example.co.za", "jane@example", "jane@example.", "jane @example.com", "jane@ex ample.com", "", "@x.com", "a@b."]) {
      expect(isValidEmail(e)).toBe(false)
    }
  })
  it("emailError: required vs optional empty", () => {
    expect(emailError("")).toBe("Required")
    expect(emailError("", false)).toBeNull()
    expect(emailError("nope")).toMatch(/valid email/)
    expect(emailError("ok@ok.com")).toBeNull()
  })
})

describe("checkPhone", () => {
  it("SA local must be exactly 10 digits", () => {
    expect(checkPhone("0821234567")).toMatchObject({ valid: true, kind: "sa" })
    expect(checkPhone("082 123 4567")).toMatchObject({ valid: true, kind: "sa" }) // spaces tolerated
    expect(checkPhone("082123456")).toMatchObject({ valid: false, kind: "sa" })   // 9 digits
    expect(checkPhone("08212345678")).toMatchObject({ valid: false, kind: "sa" }) // 11 digits
  })
  it("SA international (+27 / 0027) is 9 subscriber digits", () => {
    expect(checkPhone("+27821234567")).toMatchObject({ valid: true, kind: "sa" })
    expect(checkPhone("0027821234567")).toMatchObject({ valid: true, kind: "sa" })
    expect(checkPhone("+2782123456")).toMatchObject({ valid: false, kind: "sa" })
  })
  it("non-+27 / non-0027 international is FOREIGN (lighter rules)", () => {
    expect(checkPhone("+15551234567")).toMatchObject({ valid: true, kind: "foreign" })
    expect(checkPhone("004412345678")).toMatchObject({ valid: true, kind: "foreign" })
    expect(checkPhone("+1")).toMatchObject({ valid: false, kind: "foreign" }) // too short
  })
  it("rejects letters, a non-leading +, and numbers that don't start 0 or +", () => {
    expect(checkPhone("08abc34567")).toMatchObject({ valid: false, kind: "invalid" })
    expect(checkPhone("082+1234567")).toMatchObject({ valid: false, kind: "invalid" })
    expect(checkPhone("821234567")).toMatchObject({ valid: false, kind: "invalid" })
    expect(phoneError("")).toBe("Required")
    expect(phoneError("", false)).toBeNull()
  })
})

describe("normalizePhone → E.164", () => {
  it("collapses every SA entry form to +27XXXXXXXXX", () => {
    for (const p of ["0821234567", "082 123 4567", "+27 82 123 4567", "0027821234567"]) {
      expect(normalizePhone(p)).toBe("+27821234567")
    }
  })
  it("foreign: 00 prefix becomes +, + kept", () => {
    expect(normalizePhone("004412345678")).toBe("+4412345678")
    expect(normalizePhone("+15551234567")).toBe("+15551234567")
  })
  it("invalid → null", () => {
    expect(normalizePhone("082123")).toBeNull()
    expect(normalizePhone("")).toBeNull()
  })
})

describe("formatPhone (uniform display)", () => {
  it("groups SA as +27 82 123 4567 and is idempotent", () => {
    expect(formatPhone("0821234567")).toBe("+27 82 123 4567")
    expect(formatPhone(formatPhone("0821234567"))).toBe("+27 82 123 4567")
    expect(formatPhone("021 000 0000")).toBe("+27 21 000 0000") // landline too
  })
  it("foreign shows E.164; an unparseable value is returned trimmed (never throws)", () => {
    expect(formatPhone("+15551234567")).toBe("+15551234567")
    expect(formatPhone("  not-a-number ")).toBe("not-a-number")
  })
})

describe("isValidCipcReg", () => {
  it("accepts YYYY/NNNNNN/NN only", () => {
    expect(isValidCipcReg("2019/123456/07")).toBe(true)
    for (const r of ["2019/12345/07", "19/123456/07", "2019-123456-07", "2019/123456", "abc/123456/07", ""]) {
      expect(isValidCipcReg(r)).toBe(false)
    }
  })
})
