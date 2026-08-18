/**
 * lib/audit/__tests__/recordAudit.test.ts — the audit PII sanitiser (ADDENDUM_AUDIT_HARDENING D-2)
 *
 * The whole point of routing audits through one helper is that "PII in audit values" becomes
 * structurally impossible (SECURITY RULE #7). These tests pin that: never-log keys are dropped,
 * account/card/IBAN numbers are masked to last-4 — and a raw account number can never survive.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { __sanitiseForTest as sanitise, recordAuditReturningId, recordAuditMany } from "../recordAudit"

/** Minimal insert→select→single mock that records the inserted payload and returns a row or an error. */
function makeAuditDb(result: { id?: string; error?: boolean }): { db: SupabaseClient; inserted: unknown[] } {
  const inserted: unknown[] = []
  const single = () => Promise.resolve(
    result.error ? { data: null, error: { message: "fail" } } : { data: { id: result.id }, error: null },
  )
  const insert = (payload: unknown) => {
    inserted.push(payload)
    // recordAudit* awaits insert() directly ({error}); recordAuditReturningId chains .select().single().
    return Object.assign(Promise.resolve({ error: null }), { select: () => ({ single }) })
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

  it("MARKS never-log identifiers and secrets — value gone, key recorded", () => {
    // Contract changed 2026-08-18: these used to VANISH. The value still never lands; what changed is
    // that the row records the field was in the change set. Dropping silently meant an author writing
    // `after: { email: … }` believed they had recorded a change and had recorded nothing — and
    // recordAudit returns void, so nothing could tell them.
    const out = sanitise({
      id_number: "9001015009087", id_number_hash: "abc123", id_number_enc: "enc:xyz",
      account_number_enc: "enc:123", account_number_hash: "h:456",
      password: "hunter2", token: "tok_live_x", cvv: "123", keep: "yes",
    })
    expect(out).toEqual({
      keep: "yes",
      id_number_redacted: true, id_number_hash_redacted: true, id_number_enc_redacted: true,
      account_number_enc_redacted: true, account_number_hash_redacted: true,
      password_redacted: true, token_redacted: true, cvv_redacted: true,
    })
    // The values themselves must still be nowhere near the row.
    expect(JSON.stringify(out)).not.toContain("9001015009087")
    expect(JSON.stringify(out)).not.toContain("enc:")
    expect(JSON.stringify(out)).not.toContain("hunter2")
    expect(JSON.stringify(out)).not.toContain("tok_live_x")
  })

  it("marks a denied key with a SUFFIX, so the Category 13 raw-PII canary cannot trip on it", () => {
    // scripts/security/audit.mjs scans audit values for /"(account_number|id_number|password|…)"s*:/
    // as a canary for raw PII reaching audit_log. Re-emitting the ORIGINAL key — even with a redaction
    // marker as its value — would fire that canary on every sanitised row. The suffix is load-bearing.
    const canary = /"(account_number|id_number|password|password_hash|cvv|pin)"s*:/
    const out = sanitise({ id_number: "9001015009087", account_number_enc: "enc:1", cvv: "123" })
    expect(JSON.stringify(out)).not.toMatch(canary)
    expect(out).toHaveProperty("id_number_redacted", true)
  })

  it("records WHICH contact channel changed — the case the drop made impossible", () => {
    // The reason this contract changed. A contact-change audit whose whole point is "what changed"
    // could not say so: every candidate key matched CONTACT_PII_KEY and vanished.
    const out = sanitise({ action: "contact_update", email: "new@example.test", phone: "+27820001111" })
    expect(out).toEqual({ action: "contact_update", email_redacted: true, phone_redacted: true })
    expect(JSON.stringify(out)).not.toContain("new@example.test")
    expect(JSON.stringify(out)).not.toContain("+27820001111")
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

  it("redacts an email value even under an innocuous key name (value-level backstop)", () => {
    // `sent_to` matches no key-name denylist — the address must still be caught by shape.
    const out = sanitise({ action: "portal_invite_sent", sent_to: "tenant@example.com" })
    expect(out).toEqual({ action: "portal_invite_sent", sent_to: "[redacted-email]" })
    expect(JSON.stringify(out)).not.toContain("tenant@example.com")
  })

  it("does not over-redact @-containing strings that aren't emails", () => {
    // whitespace, no domain dot, or handle-like — all legitimate non-PII, left untouched.
    const out = sanitise({ note: "meet @ 5pm", handle: "@pleks", ref: "a@b" })
    expect(out).toEqual({ note: "meet @ 5pm", handle: "@pleks", ref: "a@b" })
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

describe("recordAuditMany (atomic coupled rows)", () => {
  it("writes all rows in ONE insert, in order, each sanitised", async () => {
    const { db, inserted } = makeAuditDb({})
    await recordAuditMany(db, [
      { orgId: "o1", actorId: "u1", action: "UPDATE", table: "maintenance_requests", recordId: "m1", after: { status: "cancelled" } },
      { orgId: "o1", actorId: "u1", action: "NOTE", table: "maintenance_requests", recordId: "m1", after: { note: "Request cancelled: leak fixed" } },
    ])
    expect(inserted).toHaveLength(1)               // single statement — atomic
    const rows = inserted[0] as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    expect(rows[0].action).toBe("UPDATE")
    expect(rows[1].action).toBe("NOTE")
    expect((rows[1].new_values as Record<string, unknown>).note).toBe("Request cancelled: leak fixed")
  })

  it("is a no-op on an empty array (no insert issued)", async () => {
    const { db, inserted } = makeAuditDb({})
    await recordAuditMany(db, [])
    expect(inserted).toHaveLength(0)
  })
})
