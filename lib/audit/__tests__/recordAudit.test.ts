/**
 * lib/audit/__tests__/recordAudit.test.ts — the audit PII sanitiser (ADDENDUM_AUDIT_HARDENING D-2)
 *
 * The whole point of routing audits through one helper is that "PII in audit values" becomes
 * structurally impossible (SECURITY RULE #7). These tests pin that: never-log keys are dropped,
 * account/card/IBAN numbers are masked to last-4 — and a raw account number can never survive.
 */
import { describe, it, expect } from "vitest"
import { __sanitiseForTest as sanitise } from "../recordAudit"

describe("recordAudit sanitiser", () => {
  it("masks account_number to last-4 and never emits the raw value", () => {
    const out = sanitise({ action: "bank_account_added", bank_name: "FNB", account_number: "62512345678", is_primary: true })
    expect(out).toEqual({ action: "bank_account_added", bank_name: "FNB", account_number_masked: "••••5678", is_primary: true })
    expect(JSON.stringify(out)).not.toContain("62512345678")
    expect(out).not.toHaveProperty("account_number")
  })

  it("masks iban and card_number too", () => {
    const out = sanitise({ iban: "GB29NWBK60161331926819", card_number: "4111111111111111" })
    expect(out).toEqual({ iban_masked: "••••6819", card_number_masked: "••••1111" })
  })

  it("drops never-log identifiers and secrets entirely", () => {
    const out = sanitise({
      id_number: "9001015009087", id_number_hash: "abc123", password: "hunter2",
      token: "tok_live_x", cvv: "123", keep: "yes",
    })
    expect(out).toEqual({ keep: "yes" })
    expect(JSON.stringify(out)).not.toContain("9001015009087")
  })

  it("masks short / non-string account numbers without leaking", () => {
    expect(sanitise({ account_number: "12" })).toEqual({ account_number_masked: "••••" })
    expect(sanitise({ account_number: 62512345678 })).toEqual({ account_number_masked: "••••" })
  })

  it("returns null for null/undefined input", () => {
    expect(sanitise(null)).toBeNull()
    expect(sanitise(undefined)).toBeNull()
  })

  it("passes through ordinary non-sensitive fields unchanged", () => {
    const out = sanitise({ action: "tenant_archived", deleted_at: "2026-06-04T00:00:00Z", bank_name: "Absa", label: "Trust" })
    expect(out).toEqual({ action: "tenant_archived", deleted_at: "2026-06-04T00:00:00Z", bank_name: "Absa", label: "Trust" })
  })
})
