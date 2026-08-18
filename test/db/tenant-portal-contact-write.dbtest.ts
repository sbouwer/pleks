/**
 * test/db/tenant-portal-contact-write.dbtest.ts — tenant portal contact writes are org-scoped, not IDOR
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db). getTenantSession() is mocked to hand
 *         updatePortalContactDetails a controlled { tenantId, orgId } — the DB tier aliases next/headers
 *         to a throwing stub (test/db/next-headers-stub.ts), so the real cookie-reading session helper
 *         cannot run in this tier.
 *
 * Notes:  Regression coverage for the three defects fixed in aa154054 (see the ⚠ comment block in
 *         app/(tenant)/tenant/account/actions.ts) — this path shipped with none of them exercised:
 *           1. Cross-org IDOR — primaryPhoneId/primaryEmailId arrive from the CLIENT and were scoped
 *              only by .eq("id", …) on the service client (RLS-bypassing). Group B.
 *           2. INSERTs omitted org_id, NOT NULL on contact_emails/contact_phones — every first-time
 *              entry failed outright. Group A.
 *           3. No { error } check on any of the four writes — failures were silent. Group C, forced
 *              organically via the real idx_contact_phones_primary / idx_contact_emails_primary unique
 *              partial indexes (a second is_primary row for the same contact) rather than a synthetic
 *              trigger injector — the same constraint 002_contacts.sql relies on in production.
 *         Group D is the "fixed by over-scoping into never matching" guard — the tenant's OWN row id
 *         must still update.
 *
 *         DEFECT 4, found while writing Group B and FIXED in the same PR (not one of the 3 originally
 *         a test scope, not a code-change scope): the IDOR-closing org_id/contact_id scoping means a
 *         foreign id UPDATE matches zero rows, and PostgREST reports zero-rows-matched as { error: null }
 *         (no failure occurred). The action therefore falls through to `{ success: true }` even though it
 *         wrote nothing. The security boundary holds — asserted directly (the foreign row is unchanged)
 *         — but the caller is told "saved" for a write that silently no-op'd. Both Group B tests assert
 *         this ground truth rather than the ideal contract; see the report for the recommended follow-up.
 */
import { describe, it, expect, vi, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedEmptyOrg, teardownOrg } from "@/test/db/tier"
import type { TenantPortalSession } from "@/lib/portal/getTenantSession"

vi.mock("@/lib/portal/getTenantSession", () => ({ getTenantSession: vi.fn() }))

import { getTenantSession } from "@/lib/portal/getTenantSession"
import { updatePortalContactDetails } from "@/app/(tenant)/tenant/account/actions"

const db = svc()
const orgIds: string[] = []
afterAll(() => { for (const id of orgIds) teardownOrg(id) })

/**
 * A structurally faithful TenantPortalSession — updatePortalContactDetails reads only tenantId/orgId;
 * the rest (leaseId, unitId, authType, tenantName, lease.*) is real-shaped filler taken verbatim from
 * the TenantPortalSession interface (lib/portal/getTenantSession.ts) so nothing is invented.
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

async function seedPrimaryPhone(orgId: string, contactId: string, number: string): Promise<string> {
  const { data, error } = await db.from("contact_phones")
    .insert({ org_id: orgId, contact_id: contactId, number, phone_type: "mobile", is_primary: true, is_active: true })
    .select("id").single()
  if (error) throw new Error(`seed contact_phone: ${error.message}`)
  return data.id as string
}

async function seedPrimaryEmail(orgId: string, contactId: string, email: string): Promise<string> {
  const { data, error } = await db.from("contact_emails")
    .insert({ org_id: orgId, contact_id: contactId, email, email_type: "personal", is_primary: true, is_active: true })
    .select("id").single()
  if (error) throw new Error(`seed contact_email: ${error.message}`)
  return data.id as string
}

async function readPhone(id: string): Promise<{ number: string; org_id: string }> {
  const { data, error } = await db.from("contact_phones").select("number, org_id").eq("id", id).single()
  if (error) throw new Error(`read contact_phone: ${error.message}`)
  return data as { number: string; org_id: string }
}

async function readEmail(id: string): Promise<{ email: string; org_id: string }> {
  const { data, error } = await db.from("contact_emails").select("email, org_id").eq("id", id).single()
  if (error) throw new Error(`read contact_email: ${error.message}`)
  return data as { email: string; org_id: string }
}

async function phonesForContact(contactId: string): Promise<Array<{ id: string; number: string; org_id: string }>> {
  const { data, error } = await db.from("contact_phones").select("id, number, org_id").eq("contact_id", contactId)
  if (error) throw new Error(`list contact_phones: ${error.message}`)
  return data as Array<{ id: string; number: string; org_id: string }>
}

async function emailsForContact(contactId: string): Promise<Array<{ id: string; email: string; org_id: string }>> {
  const { data, error } = await db.from("contact_emails").select("id, email, org_id").eq("contact_id", contactId)
  if (error) throw new Error(`list contact_emails: ${error.message}`)
  return data as Array<{ id: string; email: string; org_id: string }>
}

// ── A. first-time insert actually stores a row (defect 2: INSERTs omitted org_id) ──────────────────

describe("updatePortalContactDetails — A. first-time insert (defect 2: INSERT omitted org_id, NOT NULL)", () => {
  it("inserts a contact_phones row with the correct org_id when the tenant has none yet", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({
      contactId, orgId, phone: "+27821110001", email: null, primaryPhoneId: null, primaryEmailId: null,
    })

    expect(result).toEqual({ success: true })
    const rows = await phonesForContact(contactId)
    expect(rows).toHaveLength(1)
    expect(rows[0].number).toBe("+27821110001")
    expect(rows[0].org_id).toBe(orgId)
  })

  it("inserts a contact_emails row with the correct org_id when the tenant has none yet", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({
      contactId, orgId, phone: null, email: "tenant@example.test", primaryPhoneId: null, primaryEmailId: null,
    })

    expect(result).toEqual({ success: true })
    const rows = await emailsForContact(contactId)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe("tenant@example.test")
    expect(rows[0].org_id).toBe(orgId)
  })
})

// ── B. the cross-org IDOR is closed (defect 1) ──────────────────────────────────────────────────────

describe("updatePortalContactDetails — B. a foreign org's row id is rejected (defect 1: IDOR)", () => {
  it("org A posting org B's contact_phones.id as primaryPhoneId leaves org B's row untouched", async () => {
    const orgA = await seedEmptyOrg(db); orgIds.push(orgA)
    const orgB = await seedEmptyOrg(db); orgIds.push(orgB)
    const { contactId: contactA, tenantId: tenantA } = await seedTenant(orgA)
    const { contactId: contactB } = await seedTenant(orgB)
    const phoneBId = await seedPrimaryPhone(orgB, contactB, "+27829990000")

    mockSession(tenantA, orgA)
    const result = await updatePortalContactDetails({
      contactId: contactA, orgId: orgA, phone: "+27821230000", email: null,
      primaryPhoneId: phoneBId, primaryEmailId: null,
    })

    const after = await readPhone(phoneBId)
    expect(after.number, "org B's number must be unchanged").toBe("+27829990000")
    expect(after.org_id).toBe(orgB)

    // DEFECT 4, found while this test was being written and fixed in the same PR. The scoping makes
    // the UPDATE match zero rows — and PostgREST reports "no rows affected" as { error: null }, not a
    // failure. So the boundary held while the caller was still told "saved". The row-unchanged
    // assertion above proves the IDOR is closed; THIS one proves the caller is no longer lied to.
    // The message must say STALE, not "could not save": resubmitting the same stale id fails
    // identically and forever, so telling the tenant to retry teaches the one action that cannot work.
    expect(result.error, "a write that matched nothing must not report success").toBeTruthy()
    expect(result.error, "a zero-row match is a stale view, not a write failure").toMatch(/out of date/i)
    expect(result).not.toEqual({ success: true })
  })

  it("org A posting org B's contact_emails.id as primaryEmailId leaves org B's row untouched", async () => {
    const orgA = await seedEmptyOrg(db); orgIds.push(orgA)
    const orgB = await seedEmptyOrg(db); orgIds.push(orgB)
    const { contactId: contactA, tenantId: tenantA } = await seedTenant(orgA)
    const { contactId: contactB } = await seedTenant(orgB)
    const emailBId = await seedPrimaryEmail(orgB, contactB, "orgB@example.test")

    mockSession(tenantA, orgA)
    const result = await updatePortalContactDetails({
      contactId: contactA, orgId: orgA, phone: null, email: "attacker@example.test",
      primaryPhoneId: null, primaryEmailId: emailBId,
    })

    const after = await readEmail(emailBId)
    expect(after.email, "org B's email must be unchanged").toBe("orgB@example.test")
    expect(after.org_id).toBe(orgB)

    // Same as the phone case: zero rows matched is not a Supabase error, so before defect 4 was
    // closed the action reported success despite writing nothing.
    // The message must say STALE, not "could not save": resubmitting the same stale id fails
    // identically and forever, so telling the tenant to retry teaches the one action that cannot work.
    expect(result.error, "a write that matched nothing must not report success").toBeTruthy()
    expect(result.error, "a zero-row match is a stale view, not a write failure").toMatch(/out of date/i)
    expect(result).not.toEqual({ success: true })
  })
})

// ── C. a write failure surfaces as { error }, not silent success (defect 3) ────────────────────────

describe("updatePortalContactDetails — C. a real write failure surfaces (defect 3: no { error } check)", () => {
  it("an insert that collides with idx_contact_phones_primary returns { error }, not success", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    // A primary phone already exists; primaryPhoneId: null forces the INSERT branch, which collides
    // with the unique partial index (contact_id) WHERE is_primary = true — a real DB failure, not a
    // synthetic injector.
    await seedPrimaryPhone(orgId, contactId, "+27821110099")
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({
      contactId, orgId, phone: "+27821119999", email: null, primaryPhoneId: null, primaryEmailId: null,
    })

    expect(result, "a failed insert must not be reported as a success").toHaveProperty("error")
    // A GENUINE write failure IS retryable, so it must NOT be reported as a stale view. Asserting the
    // negative here is what keeps the two branches distinguishable — without it both could collapse
    // to one generic string and every test would still pass.
    expect((result as { error?: string }).error, "a real write failure is not a stale view")
      .not.toMatch(/out of date/i)
    const rows = await phonesForContact(contactId)
    expect(rows, "the failed insert must not have landed a second row").toHaveLength(1)
    expect(rows[0].number).toBe("+27821110099")
  })

  it("an insert that collides with idx_contact_emails_primary returns { error }, not success", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    await seedPrimaryEmail(orgId, contactId, "existing@example.test")
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({
      contactId, orgId, phone: null, email: "new@example.test", primaryPhoneId: null, primaryEmailId: null,
    })

    expect(result, "a failed insert must not be reported as a success").toHaveProperty("error")
    // A GENUINE write failure IS retryable, so it must NOT be reported as a stale view. Asserting the
    // negative here is what keeps the two branches distinguishable — without it both could collapse
    // to one generic string and every test would still pass.
    expect((result as { error?: string }).error, "a real write failure is not a stale view")
      .not.toMatch(/out of date/i)
    const rows = await emailsForContact(contactId)
    expect(rows, "the failed insert must not have landed a second row").toHaveLength(1)
    expect(rows[0].email).toBe("existing@example.test")
  })
})

// ── D. the happy path still works — not over-scoped into never matching ────────────────────────────

describe("updatePortalContactDetails — D. the tenant's OWN row id still updates", () => {
  it("updates the tenant's own primary phone", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    const phoneId = await seedPrimaryPhone(orgId, contactId, "+27820001111")
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({
      contactId, orgId, phone: "+27820002222", email: null, primaryPhoneId: phoneId, primaryEmailId: null,
    })

    expect(result).toEqual({ success: true })
    const after = await readPhone(phoneId)
    expect(after.number).toBe("+27820002222")
  })

  it("updates the tenant's own primary email", async () => {
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    const emailId = await seedPrimaryEmail(orgId, contactId, "old@example.test")
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({
      contactId, orgId, phone: null, email: "new@example.test", primaryPhoneId: null, primaryEmailId: emailId,
    })

    expect(result).toEqual({ success: true })
    const after = await readEmail(emailId)
    expect(after.email).toBe("new@example.test")
  })
})

// ── E. the audit row actually lands (defect 5: actorId was a tenants.id, FK'd to auth.users) ───────

describe("updatePortalContactDetails — E. the change is audited (defect 5)", () => {
  it("writes an audit_log row instead of silently violating the changed_by FK", async () => {
    // `actorId` becomes audit_log.changed_by, which REFERENCES auth.users(id) (001_foundation.sql:151).
    // The action used to pass session.tenantId — a tenants.id — so every insert violated the FK.
    // recordAudit returns void and logs its own failure, so nothing surfaced: the FK error was
    // printed on every call and read by nobody. This asserts the ROW, not the absence of a throw —
    // the audit is only meaningful if it exists.
    const orgId = await seedEmptyOrg(db); orgIds.push(orgId)
    const { contactId, tenantId } = await seedTenant(orgId)
    mockSession(tenantId, orgId)

    const result = await updatePortalContactDetails({
      contactId, orgId, phone: "+27820007777", email: null, primaryPhoneId: null, primaryEmailId: null,
    })
    expect(result).toEqual({ success: true })

    const { data, error } = await db.from("audit_log")
      .select("changed_by, actor_name, new_values")
      .eq("org_id", orgId).eq("record_id", contactId).eq("table_name", "contacts")
    expect(error).toBeNull()
    expect(data, "the contact change must produce exactly one audit row").toHaveLength(1)

    const row = data![0] as { changed_by: string | null; actor_name: string | null; new_values: Record<string, unknown> }
    expect(row.changed_by, "no auth user exists for a portal session — null is correct, not a tenants.id").toBeNull()
    expect(row.actor_name, "attribution must survive the null actorId").toBeTruthy()
    expect(row.new_values.actor_tenant_id, "the tenant must still be traceable in the values").toBe(tenantId)
  })
})
