/**
 * test/db/contact-email-derivation.dbtest.ts — primary_email is a derived cache, and erasure clears it
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  UNIFICATION §7 step 5. Three behaviours that a migration file can only STATE; only running
 *         them proves them.
 *
 *         1. THE POPIA ARM (§6). anonymisePlan erases via contact_emails. The derive trigger's DELETE
 *            arm is what stops the address surviving in contacts.primary_email afterwards. Get that
 *            wrong and you have an erasure that does not erase — and it PASSES REVIEW, because the
 *            plan correctly targets the authoritative table. anonymisePlan also nulls the column
 *            explicitly (anonymisePlan.ts:73); that redundancy is the belt to this trigger's braces,
 *            and THIS test is what makes it meaningful rather than decorative.
 *
 *         2. TRAP 4 (CD §10.1). The partial unique index keys on is_primary ALONE, while every reader
 *            requires is_primary AND is_active. So (primary, inactive) would occupy a contact's only
 *            primary slot while being invisible — derived email NULL, and no new primary assignable
 *            until the stale row was un-primaried. A CHECK makes that unrepresentable; this asserts
 *            the CHECK actually fires rather than merely existing.
 *
 *         3. DERIVATION ITSELF, on all three arms. A trigger nobody has executed is a claim.
 */
import { describe, it, expect, afterAll } from "vitest"
import { svc, seedEmptyOrg, teardownOrg } from "@/test/db/tier"

const db = svc()
const orgIds: string[] = []

afterAll(() => { for (const id of orgIds) teardownOrg(id) })

async function seedContact(email: string | null) {
  const orgId = await seedEmptyOrg(db)
  orgIds.push(orgId)

  const { data: contact, error } = await db.from("contacts")
    .insert({ org_id: orgId, first_name: "Derive", last_name: "Probe" })
    .select("id").single()
  if (error) throw new Error(`seed contact: ${error.message}`)
  const contactId = contact.id as string

  if (email) {
    const { error: e } = await db.from("contact_emails")
      .insert({ org_id: orgId, contact_id: contactId, email, email_type: "personal", is_primary: true, is_active: true })
    if (e) throw new Error(`seed contact_email: ${e.message}`)
  }
  return { orgId, contactId }
}

async function primaryEmail(contactId: string): Promise<string | null> {
  const { data, error } = await db.from("contacts").select("primary_email").eq("id", contactId).single()
  if (error) throw new Error(`read primary_email: ${error.message}`)
  return (data.primary_email as string | null) ?? null
}

describe("primary_email is derived from contact_emails", () => {
  it("INSERT of a primary email populates the cache", async () => {
    const { contactId } = await seedContact("derive-insert@example.invalid")
    expect(await primaryEmail(contactId)).toBe("derive-insert@example.invalid")
  })

  it("UPDATE of the primary email moves the cache with it", async () => {
    const { orgId, contactId } = await seedContact("before@example.invalid")
    const { error } = await db.from("contact_emails")
      .update({ email: "after@example.invalid" }).eq("org_id", orgId).eq("contact_id", contactId).eq("is_primary", true)
    expect(error).toBeNull()
    expect(await primaryEmail(contactId)).toBe("after@example.invalid")
  })

  it("DELETE of the primary email clears the cache — the POPIA arm", async () => {
    // The load-bearing one. anonymisePlan erases via contact_emails; without this arm the address
    // would survive in primary_email and the erasure would be a no-op where it matters most.
    const { orgId, contactId } = await seedContact("erase-me@example.invalid")
    expect(await primaryEmail(contactId)).toBe("erase-me@example.invalid")

    const { error } = await db.from("contact_emails").delete().eq("org_id", orgId).eq("contact_id", contactId)
    expect(error).toBeNull()
    expect(await primaryEmail(contactId)).toBeNull()
  })

  it("a contact with no email rows derives NULL, not a stale value", async () => {
    // Deriving correctly INCREASES the unreachable-tenant count, because a stale non-null column
    // was masking contacts who were never reachable. That is the measurement working.
    const { contactId } = await seedContact(null)
    expect(await primaryEmail(contactId)).toBeNull()
  })
})

describe("trap 4 — a primary row can never be inactive (CD §10.1)", () => {
  it("the CHECK rejects deactivating a row that is still primary", async () => {
    const { orgId, contactId } = await seedContact("trap4@example.invalid")

    // The obvious "remove an address" implementation: flip is_active, leave is_primary. Without the
    // CHECK this succeeds and strands the contact — the row holds the unique primary slot while being
    // invisible to every reader, so primary_email is NULL and no NEW primary can be inserted.
    const { error } = await db.from("contact_emails")
      .update({ is_active: false }).eq("org_id", orgId).eq("contact_id", contactId).eq("is_primary", true)

    expect(error, "the CHECK must reject primary+inactive").not.toBeNull()
    expect(await primaryEmail(contactId)).toBe("trap4@example.invalid")   // unchanged, not stranded
  })

  it("clearing is_primary alongside is_active is the correct removal, and frees the slot", async () => {
    const { orgId, contactId } = await seedContact("old@example.invalid")

    const { error: demote } = await db.from("contact_emails")
      .update({ is_primary: false, is_active: false }).eq("org_id", orgId).eq("contact_id", contactId).eq("is_primary", true)
    expect(demote).toBeNull()
    expect(await primaryEmail(contactId)).toBeNull()

    // The slot must be free immediately — this is what trap 4 would have blocked.
    const { error: insert } = await db.from("contact_emails")
      .insert({ org_id: orgId, contact_id: contactId, email: "new@example.invalid", email_type: "personal", is_primary: true, is_active: true })
    expect(insert, "a new primary must be insertable straight after a correct removal").toBeNull()
    expect(await primaryEmail(contactId)).toBe("new@example.invalid")
  })
})
