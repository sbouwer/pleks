/**
 * test/db/tenant-portal-contact-write.dbtest.ts — tenant portal contact writes are session-derived and idempotent
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db). getTenantSession() is mocked to hand
 *         updatePortalContactDetails a controlled { tenantId, orgId } — the DB tier aliases next/headers
 *         to a throwing stub (test/db/next-headers-stub.ts), so the real cookie-reading session helper
 *         cannot run in this tier.
 *
 * Notes:  Rewritten 2026-08-18 alongside the action for the new `{ phone, email }`-only contract (see the
 *         header of app/(tenant)/tenant/account/actions.ts for the six defects that drove it — this file
 *         used to cover defects 1–3 and 5; the action's shape change means 1, 4 and 6 no longer have a
 *         code path to test against).
 *
 *         The OLD Group C ("a real write failure surfaces", defect 3) is DELETED, not ported. Its premise
 *         was a client-supplied `primaryPhoneId: null` forcing a resolve-then-insert branch into a
 *         collision with idx_contact_phones_primary. That branch no longer exists —
 *         syncPrimaryContact{Phone,Email} clear-then-insert with no id input at all, so there is nothing
 *         left to collide and nothing for a caller to force the collision with. Porting the old assertion
 *         forward would have kept a regression guard alive for a code path that was deleted specifically
 *         because it was wrong, and would pressure a future change to keep a client-id branch alive just
 *         to satisfy it. Likewise the old Group B (cross-org IDOR via a client-supplied row id) and Group D
 *         (the tenant's own id still updates) lost their premise — there is no id in the payload for
 *         either test to exercise — and are replaced below by Group D/E, which attack the same boundary
 *         through the only surface that still exists: the session.
 *
 *         Coverage:
 *           A. first-time save stores rows with the correct org_id (defect 2)
 *           B. repeated saves are idempotent — three calls in a row, no id ever supplied or refreshed.
 *              THE case defect 6 fixed: the old shape wrote once then hard-failed on the unique index.
 *           C. a concurrent agent edit (which replaces the row and changes its id, via the same
 *              syncPrimaryContactPhone the action itself calls) does not break the tenant's next save —
 *              impossible to pass under the old client-id contract.
 *           D. cross-org isolation. There is no id left to attack with, so this is a boundary regression
 *              guard, not an IDOR repro — say so at the test, not just here.
 *           E. same-org isolation — two tenants, one org; untested by the previous file. `.eq("org_id", …)`
 *              is a no-op between them; only the session → tenant → contact resolution stands in the way.
 *           F. both channels in one payload write both rows and exactly one audit row.
 *           G. server-side validation rejects a malformed email / short phone and writes nothing; a valid
 *              address with surrounding whitespace is accepted and stored trimmed.
 *           H. label / can_whatsapp set by an agent survive a tenant-initiated save (the syncPrimaryPhone
 *              fix — the replacement row used to be built from scratch, destroying both).
 *           I. the audit row lands with changed_by null, actor_name set (defect 5, kept from the old file).
 */
import { describe, it, expect, vi, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedEmptyOrg, teardownOrg } from "@/test/db/tier"
import type { TenantPortalSession } from "@/lib/portal/getTenantSession"

vi.mock("@/lib/portal/getTenantSession", () => ({ getTenantSession: vi.fn() }))

import { getTenantSession } from "@/lib/portal/getTenantSession"
import { updatePortalContactDetails } from "@/app/(tenant)/tenant/account/actions"
import { syncPrimaryContactPhone } from "@/lib/contacts/syncPrimaryPhone"

/** The action's return type is an inferred union of object literals ({error} | {success}) with no
 *  common shape — cast through this when a test needs `.error` without narrowing first. */
type ActionResult = { error?: string; success?: boolean }

const db = svc()
const orgIds: string[] = []
afterAll(() => { for (const id of orgIds) teardownOrg(id) })

/**
 * A structurally faithful TenantPortalSession — updatePortalContactDetails reads only tenantId/orgId
 * (plus tenantName/authType for the audit row); the rest (leaseId, unitId, lease.*) is real-shaped filler
 * taken verbatim from the TenantPortalSession interface (lib/portal/getTenantSession.ts) so nothing is
 * invented.
 */
function mockSession(tenantId: string, orgId: string): void {
  const session: TenantPortalSession = {
    tenantId,
    orgId,
    leaseId: randomUUID(),
    unitId: randomUUID(),
    authType: "token",
    tenantName: "Test Tenant",
    lease: {
      id: randomUUID(),
      status: "active",
      lease_type: null,
      start_date: null,
      end_date: null,
      monthly_rent_cents: null,
      deposit_cents: null,
      escalation_rate: null,
      next_escalation_date: null,
      payment_due_day: null,
      template_source: "manual",
      generated_doc_path: null,
      external_document_path: null,
      payment_reference: null,
    },
  }
  vi.mocked(getTenantSession).mockResolvedValue(session)
}

// ── Seeding ──────────────────────────────────────────────────────────────────────────────────────

async function seedTenant(orgId: string): Promise<{ contactId: string; tenantId: string }> {
  const { data: contact, error: cErr } = await db.from("contacts")
    .insert({ org_id: orgId, first_name: "Portal", last_name: "Tenant" })
    .select("id").single()
  if (cErr) throw new Error(`seed contact: ${cErr.message}`)

  const { data: tenant, error: tErr } = await db.from("tenants")
    .insert({ org_id: orgId, contact_id: contact.id })
    .select("id").single()
  if (tErr) throw new Error(`seed tenant: ${tErr.message}`)

  return { contactId: contact.id as string, tenantId: tenant.id as string }
}

async function seedPrimaryPhone(
  orgId: string, contactId: string, number: string,
  extra: { label?: string | null; can_whatsapp?: boolean } = {},
): Promise<string> {
  const { data, error } = await db.from("contact_phones")
    .insert({
      org_id: orgId, contact_id: contactId, number, phone_type: "mobile", is_primary: true, is_active: true,
      label: extra.label ?? null, can_whatsapp: extra.can_whatsapp ?? false,
    })
    .select("id").single()
  if (error) throw new Error(`seed contact_phone: ${error.message}`)
  return data.id as string
}

async function seedPrimaryEmail(
  orgId: string, contactId: string, email: string,
  extra: { label?: string | null } = {},
): Promise<string> {
  const { data, error } = await db.from("contact_emails")
    .insert({
      org_id: orgId, contact_id: contactId, email, email_type: "personal", is_primary: true, is_active: true,
      label: extra.label ?? null,
    })
    .select("id").single()
  if (error) throw new Error(`seed contact_email: ${error.message}`)
  return data.id as string
}

/** The action never returns a row id, and clear-then-insert means any id captured before a save is
 *  stale after it — every read in this file goes by (contact_id, is_primary) instead. */
async function primaryPhoneRow(contactId: string): Promise<
  { id: string; number: string; org_id: string; label: string | null; can_whatsapp: boolean } | null
> {
  const { data, error } = await db.from("contact_phones")
    .select("id, number, org_id, label, can_whatsapp")
    .eq("contact_id", contactId).eq("is_primary", true).maybeSingle()
  if (error) throw new Error(`read primary contact_phone: ${error.message}`)
  return data as { id: string; number: string; org_id: string; label: string | null; can_whatsapp: boolean } | null
}

async function primaryEmailRow(contactId: string): Promise<
  { id: string; email: string; org_id: string; label: string | null } | null
> {
  const { data, error } = await db.from("contact_emails")
    .select("id, email, org_id, label")
    .eq("contact_id", contactId).eq("is_primary", true).maybeSingle()
  if (error) throw new Error(`read primary contact_email: ${error.message}`)
  return data as { id: string; email: string; org_id: string; label: string | null } | null
}

async function primaryPhoneCount(contactId: string): Promise<number> {
  const { data, error } = await db.from("contact_phones").select("id")
    .eq("contact_id", contactId).eq("is_primary", true)
  if (error) throw new Error(`count contact_phones: ${error.message}`)
  return (data ?? []).length
}

// ── A. first-time save stores rows with the correct org_id (defect 2) ──────────────────────────────

describe("updatePortalContactDetails — A. first-time save (defect 2: INSERT omitted org_id, NOT NULL)", () => {
  it("stores a contact_phones row with the correct org_id when the tenant has none yet", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: "+27821110001", email: null })

    expect(result).toEqual({ success: true })
    const row = await primaryPhoneRow(contactId)
    expect(row?.number).toBe("+27821110001")
    expect(row?.org_id).toBe(orgId)
  })

  it("stores a contact_emails row with the correct org_id when the tenant has none yet", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: null, email: "tenant@example.test" })

    expect(result).toEqual({ success: true })
    const row = await primaryEmailRow(contactId)
    expect(row?.email).toBe("tenant@example.test")
    expect(row?.org_id).toBe(orgId)
  })
})

// ── B. repeated saves are idempotent (defect 6) — THE critical new case ────────────────────────────

describe("updatePortalContactDetails — B. repeated saves are idempotent (defect 6)", () => {
  it("three consecutive saves with different values all succeed; primary count never exceeds 1", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    // No page reload and no id refresh between calls — there is no id in the payload to refresh. Under
    // the old client-id contract the FIRST call took the INSERT branch and every call after it hit
    // idx_contact_phones_primary. This is the case that made that shape unusable.
    for (const number of ["+27821110001", "+27821110002", "+27821110003"]) {
      const result = await updatePortalContactDetails({ phone: number, email: null })
      expect(result, `save of ${number} must succeed`).toEqual({ success: true })
      const row = await primaryPhoneRow(contactId)
      expect(row?.number).toBe(number)
      expect(await primaryPhoneCount(contactId), "clear-then-insert must never leave two primaries").toBe(1)
    }
  })
})

// ── C. a concurrent agent edit does not break the tenant's next save ───────────────────────────────

describe("updatePortalContactDetails — C. a concurrent agent edit does not break the tenant's next save", () => {
  it("tenant saves, agent replaces the row (id changes), tenant saves again — both succeed", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const first = await updatePortalContactDetails({ phone: "+27821110001", email: null })
    expect(first).toEqual({ success: true })
    const afterFirst = await primaryPhoneRow(contactId)
    expect(afterFirst?.number).toBe("+27821110001")

    // Simulate an agent editing the SAME contact directly through the sync helper — exactly what an
    // agent-side write does. clear-then-insert means the row's id changes here even though the tenant
    // never reloaded and has no way to know a new id exists.
    const agentResult = await syncPrimaryContactPhone(db, orgId, contactId, "+27829998888", "mobile")
    expect(agentResult.error).toBeNull()
    const afterAgent = await primaryPhoneRow(contactId)
    expect(afterAgent?.number).toBe("+27829998888")
    expect(afterAgent?.id, "clear-then-insert must produce a new row id").not.toBe(afterFirst?.id)

    // The tenant saves again with the same stale view (there is nothing to refresh — the payload never
    // carried an id). Under the old client-id contract this failed permanently until reload.
    const second = await updatePortalContactDetails({ phone: "+27821119999", email: null })
    expect(second).toEqual({ success: true })
    const afterSecond = await primaryPhoneRow(contactId)
    expect(afterSecond?.number).toBe("+27821119999")
    expect(await primaryPhoneCount(contactId)).toBe(1)
  })
})

// ── D. cross-org isolation ──────────────────────────────────────────────────────────────────────────

describe("updatePortalContactDetails — D. cross-org isolation", () => {
  it("org A's tenant save leaves org B's rows untouched", async () => {
    // There is no id in the payload any more, so this is NOT an IDOR reproduction (that requires a
    // caller-supplied id to misdirect) — it is a boundary regression guard: proof that the session →
    // tenant → contact resolution never crosses an org line even by accident.
    const orgA = await seedEmptyOrg(db); orgIds.push(orgA)
    const orgB = await seedEmptyOrg(db); orgIds.push(orgB)
    const { tenantId: tenantA } = await seedTenant(orgA)
    const { contactId: contactB } = await seedTenant(orgB)
    const phoneBId = await seedPrimaryPhone(orgB, contactB, "+27829990000")
    const emailBId = await seedPrimaryEmail(orgB, contactB, "orgB@example.test")

    mockSession(tenantA, orgA)
    const result = await updatePortalContactDetails({ phone: "+27821230000", email: "attacker@example.test" })
    expect(result).toEqual({ success: true })

    const phoneAfter = await primaryPhoneRow(contactB)
    expect(phoneAfter?.id, "org B's phone row must not even be replaced").toBe(phoneBId)
    expect(phoneAfter?.number).toBe("+27829990000")
    expect(phoneAfter?.org_id).toBe(orgB)

    const emailAfter = await primaryEmailRow(contactB)
    expect(emailAfter?.id, "org B's email row must not even be replaced").toBe(emailBId)
    expect(emailAfter?.email).toBe("orgB@example.test")
    expect(emailAfter?.org_id).toBe(orgB)
  })
})

// ── E. same-org isolation (untested by the previous file) ──────────────────────────────────────────

describe("updatePortalContactDetails — E. same-org isolation", () => {
  it("tenant A's save leaves tenant B's rows untouched, even though both share org_id", async () => {
    // `.eq("org_id", …)` is a no-op between these two — they're the same org. Only the session → tenant
    // → contact resolution inside the action stands between them.
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId: contactA, tenantId: tenantA } = await seedTenant(orgId)
    const { contactId: contactB } = await seedTenant(orgId)
    const phoneBId = await seedPrimaryPhone(orgId, contactB, "+27829990001")

    mockSession(tenantA, orgId)
    const result = await updatePortalContactDetails({ phone: "+27821230001", email: null })
    expect(result).toEqual({ success: true })

    const phoneAAfter = await primaryPhoneRow(contactA)
    expect(phoneAAfter?.number).toBe("+27821230001")

    const phoneBAfter = await primaryPhoneRow(contactB)
    expect(phoneBAfter?.id, "tenant B's row must not even be replaced").toBe(phoneBId)
    expect(phoneBAfter?.number).toBe("+27829990001")
  })
})

// ── F. both channels in one payload ─────────────────────────────────────────────────────────────────

describe("updatePortalContactDetails — F. both channels in one payload", () => {
  it("writes both rows and exactly one audit row naming both channels", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: "+27821110055", email: "both@example.test" })
    expect(result).toEqual({ success: true })

    const phone = await primaryPhoneRow(contactId)
    const email = await primaryEmailRow(contactId)
    expect(phone?.number).toBe("+27821110055")
    expect(email?.email).toBe("both@example.test")

    const { data, error } = await db.from("audit_log").select("new_values")
      .eq("org_id", orgId).eq("record_id", contactId).eq("table_name", "contacts")
    expect(error).toBeNull()
    expect(data, "one save touching both channels must write exactly one audit row").toHaveLength(1)
    const values = data![0].new_values as { channels_changed: string[] }
    expect(values.channels_changed).toEqual(["phone", "email"])
  })
})

// ── G. server-side validation ───────────────────────────────────────────────────────────────────────

describe("updatePortalContactDetails — G. server-side validation", () => {
  it("rejects a malformed email and writes nothing", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: null, email: "  NotAnEmail  " })

    expect((result as ActionResult).error, "a malformed email must be rejected").toBeTruthy()
    expect((result as ActionResult).success).toBeUndefined()
    expect(await primaryEmailRow(contactId), "the rejected value must not have been written").toBeNull()
  })

  it("rejects a too-short phone number and writes nothing", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: "12345678", email: null }) // 8 digits, < 9

    expect((result as ActionResult).error, "a too-short phone must be rejected").toBeTruthy()
    expect((result as ActionResult).success).toBeUndefined()
    expect(await primaryPhoneRow(contactId), "the rejected value must not have been written").toBeNull()
  })

  it("accepts a valid email with surrounding whitespace and stores it trimmed", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: null, email: "  trimmed@example.test  " })

    expect(result).toEqual({ success: true })
    const row = await primaryEmailRow(contactId)
    expect(row?.email, "a valid address must be stored trimmed, not verbatim").toBe("trimmed@example.test")
  })
})

// ── H. label / can_whatsapp survive a tenant save ───────────────────────────────────────────────────

describe("updatePortalContactDetails — H. label / can_whatsapp survive a tenant save (syncPrimaryPhone fix)", () => {
  it("an agent-set label and can_whatsapp flag are still set on the replacement row", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    await seedPrimaryPhone(orgId, contactId, "+27820001111", { label: "After hours", can_whatsapp: true })
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: "+27820002222", email: null })

    expect(result).toEqual({ success: true })
    const row = await primaryPhoneRow(contactId)
    expect(row?.number).toBe("+27820002222")
    expect(row?.label, "an agent-set label must not be destroyed by a tenant save").toBe("After hours")
    expect(row?.can_whatsapp, "an agent-set can_whatsapp flag must not be destroyed by a tenant save").toBe(true)
  })
})

// ── I. the change is audited (defect 5) ─────────────────────────────────────────────────────────────

describe("updatePortalContactDetails — I. the change is audited (defect 5)", () => {
  it("writes an audit_log row instead of silently violating the changed_by FK", async () => {
    // `actorId` becomes audit_log.changed_by, which REFERENCES auth.users(id) (001_foundation.sql:151).
    // The old action passed session.tenantId — a tenants.id — so every insert violated the FK.
    // recordAudit returns void and logs its own failure, so nothing surfaced: the FK error was printed
    // on every call and read by nobody. This asserts the ROW, not the absence of a throw.
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({ phone: "+27820007777", email: null })
    expect(result).toEqual({ success: true })

    const { data, error } = await db.from("audit_log")
      .select("changed_by, actor_name, new_values")
      .eq("org_id", orgId).eq("record_id", contactId).eq("table_name", "contacts")
    expect(error).toBeNull()
    expect(data, "the contact change must produce exactly one audit row").toHaveLength(1)

    const row = data![0] as {
      changed_by: string | null; actor_name: string | null
      new_values: { actor_tenant_id: string; channels_changed: string[] }
    }
    expect(row.changed_by, "no auth user exists for a portal session — null is correct, not a tenants.id").toBeNull()
    expect(row.actor_name, "attribution must survive the null actorId").toBeTruthy()
    expect(row.new_values.actor_tenant_id, "the tenant must still be traceable in the values").toBe(tenantId)
    expect(row.new_values.channels_changed).toEqual(["phone"])
  })
})
