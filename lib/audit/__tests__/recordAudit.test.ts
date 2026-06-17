/**
 * lib/audit/__tests__/recordAudit.test.ts — the audit PII sanitiser (ADDENDUM_AUDIT_HARDENING D-2)
 *
 * The whole point of routing audits through one helper is that "PII in audit values" becomes
 * structurally impossible (SECURITY RULE #7). These tests pin that: never-log keys are dropped,
 * account/card/IBAN numbers are masked to last-4 — and a raw account number can never survive.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { __sanitiseForTest as sanitise, recordAuditReturningId } from "../recordAudit"

/** Minimal insert→select→single mock that records the inserted payload and returns a row or an error. */
function makeAuditDb(result: { id?: string; error?: boolean }): { db: SupabaseClient; inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = []
  const single = () => Promise.resolve(
    result.error ? { data: null, error: { message: "fail" } } : { data: { id: result.id }, error: null },
  )
  const insert = (payload: Record<string, unknown>) => {
    inserted.push(payload)
    return { select: () => ({ single }) }
  }
  return { db: { from: () => ({ insert }) } as unknown as SupabaseClient, inserted }
}

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

  it("drops never-log identifiers and secrets entirely (incl. _enc / _hash variants)", () => {
    const out = sanitise({
      id_number: "9001015009087", id_number_hash: "abc123", id_number_enc: "enc:xyz",
      account_number_enc: "enc:123", account_number_hash: "h:456",
      password: "hunter2", token: "tok_live_x", cvv: "123", keep: "yes",
    })
    expect(out).toEqual({ keep: "yes" })
    expect(JSON.stringify(out)).not.toContain("9001015009087")
    expect(JSON.stringify(out)).not.toContain("enc:")
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

describe("recordAuditReturningId (F3 decision-accountability backlink)", () => {
  it("returns the inserted audit_log id so a decision write can capture it", async () => {
    const { db } = makeAuditDb({ id: "audit-123" })
    const id = await recordAuditReturningId(db, { orgId: "o1", actorId: "u1", action: "UPDATE", table: "applications", recordId: "a1", after: { action: "x" } })
    expect(id).toBe("audit-123")
  })

  it("returns null (best-effort backlink) when the audit write fails", async () => {
    const { db } = makeAuditDb({ error: true })
    const id = await recordAuditReturningId(db, { orgId: "o1", actorId: "u1", action: "UPDATE", table: "applications", recordId: "a1" })
    expect(id).toBeNull()
  })
})
