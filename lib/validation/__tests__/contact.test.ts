import { describe, it, expect } from "vitest"
import { isValidEmail, checkPhone, normalizePhone, formatPhone, phoneToWhatsApp, isValidCipcReg, cipcRegError, emailError, phoneError } from "@/lib/validation/contact"

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
  it("non-+27 international is FOREIGN, validated by that country's plan", () => {
    expect(checkPhone("+12133734253")).toMatchObject({ valid: true, kind: "foreign", country: "US" }) // LA
    expect(checkPhone("0012133734253")).toMatchObject({ valid: true, kind: "foreign", country: "US" }) // 00 IDD
    expect(checkPhone("+1")).toMatchObject({ valid: false }) // too short
  })
  it("rejects letters and numbers with no country context", () => {
    expect(checkPhone("08abc34567")).toMatchObject({ valid: false, kind: "invalid" })
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
    expect(normalizePhone("0012133734253")).toBe("+12133734253")
    expect(normalizePhone("+12133734253")).toBe("+12133734253")
  })
  it("invalid → null", () => {
    expect(normalizePhone("082123")).toBeNull()
    expect(normalizePhone("")).toBeNull()
  })
})

describe("formatPhone (uniform, grouped per country)", () => {
  it("groups SA and is idempotent", () => {
    expect(formatPhone("0821234567")).toBe("+27 82 123 4567")
    expect(formatPhone(formatPhone("0821234567"))).toBe("+27 82 123 4567")
  })
  it("groups foreign numbers correctly too; unparseable returned trimmed (never throws)", () => {
    expect(formatPhone("+12133734253")).toBe("+1 213 373 4253")
    expect(formatPhone("  not-a-number ")).toBe("not-a-number")
  })
})

describe("phoneToWhatsApp", () => {
  it("returns digits-only E.164 (no +) or null", () => {
    expect(phoneToWhatsApp("0821234567")).toBe("27821234567")
    expect(phoneToWhatsApp("+12133734253")).toBe("12133734253")
    expect(phoneToWhatsApp("nope")).toBeNull()
  })
})

describe("isValidCipcReg / cipcRegError", () => {
  it("accepts a well-formed number and auto-inserts the separators from 12 bare digits", () => {
    expect(isValidCipcReg("2019/123456/07")).toBe(true)
    expect(isValidCipcReg("201912345607")).toBe(true) // separators inferred
  })
  it("rejects a bad year and an unknown entity-type code (e.g. 9250/591159/01)", () => {
    expect(isValidCipcReg("9250/591159/01")).toBe(false)
    expect(cipcRegError("9250/591159/01")).toMatch(/registration year/)
    expect(cipcRegError("2019/123456/01")).toMatch(/entity-type code/)
  })
  it("enforces the entity-type code matches the company type", () => {
    expect(isValidCipcReg("2019/123456/07", "pty_ltd")).toBe(true)
    expect(isValidCipcReg("2019/123456/23", "cc")).toBe(true)
    expect(isValidCipcReg("2019/123456/08", "npc")).toBe(true)
    expect(cipcRegError("2019/123456/23", true, "pty_ltd")).toMatch(/ends in \/07/)
  })
  it("auto-corrects dash separators, but rejects truly malformed shapes", () => {
    expect(isValidCipcReg("2019-123456-07")).toBe(true) // dashes → slashes, then valid
    for (const r of ["2019/12345/07", "2019/123456", "abc/123456/07", ""]) {
      expect(isValidCipcReg(r)).toBe(false)
    }
  })
})
