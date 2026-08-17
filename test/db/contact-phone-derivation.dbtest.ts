/**
 * test/db/contact-phone-derivation.dbtest.ts — primary_phone is a derived cache, and erasure clears it
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  NOW.md item 12 step 3 — the mirror of contact-email-derivation.dbtest.ts. Same three
 *         behaviours, same reasons; a migration file can STATE them, only running them proves them.
 *
 *         1. THE POPIA ARM. anonymisePlan erases via contact_phones (entry A.contact_phones). The
 *            derive trigger's DELETE arm is what stops the number surviving in contacts.primary_phone
 *            afterwards. Get it wrong and you have an erasure that does not erase — and it PASSES
 *            REVIEW, because the plan correctly targets the authoritative table. anonymisePlan also
 *            nulls the column explicitly; that redundancy is the belt to this trigger's braces.
 *
 *         2. TRAP 4 (CD §10.1). idx_contact_phones_primary keys on is_primary ALONE while every
 *            reader requires is_primary AND is_active, so (primary, inactive) would hold a contact's
 *            only primary slot invisibly — derived phone NULL, no new primary assignable. A CHECK
 *            makes that unrepresentable; this asserts the CHECK fires rather than merely existing.
 *
 *         3. DERIVATION ITSELF, on all three arms. A trigger nobody has executed is a claim.
 *
 *         The source column is `number`, not `phone` — the single most likely place to get this
 *         mirror wrong, and the reason the INSERT arm is asserted rather than assumed.
 */
import { describe, it, expect, afterAll } from "vitest"
import { svc, seedEmptyOrg, teardownOrg } from "@/test/db/tier"

const db = svc()
const orgIds: string[] = []

afterAll(() => { for (const id of orgIds) teardownOrg(id) })

async function seedContact(number: string | null) {
  const orgId = await seedEmptyOrg(db)
  orgIds.push(orgId)

  const { data: contact, error } = await db.from("contacts")
    .insert({ org_id: orgId, first_name: "Derive", last_name: "PhoneProbe" })
    .select("id").single()
  if (error) throw new Error(`seed contact: ${error.message}`)
  const contactId = contact.id as string

  if (number) {
    const { error: e } = await db.from("contact_phones")
      .insert({ org_id: orgId, contact_id: contactId, number, phone_type: "mobile", is_primary: true, is_active: true })
    if (e) throw new Error(`seed contact_phone: ${e.message}`)
  }
  return { orgId, contactId }
}

async function primaryPhone(contactId: string): Promise<string | null> {
  const { data, error } = await db.from("contacts").select("primary_phone").eq("id", contactId).single()
  if (error) throw new Error(`read primary_phone: ${error.message}`)
  return (data.primary_phone as string | null) ?? null
}

describe("primary_phone is derived from contact_phones", () => {
  it("INSERT of a primary phone populates the cache", async () => {
    const { contactId } = await seedContact("+27821110001")
    expect(await primaryPhone(contactId)).toBe("+27821110001")
  })

  it("UPDATE of the primary phone moves the cache with it", async () => {
    const { orgId, contactId } = await seedContact("+27821110002")
    const { error } = await db.from("contact_phones")
      .update({ number: "+27821119999" }).eq("org_id", orgId).eq("contact_id", contactId).eq("is_primary", true)
    expect(error).toBeNull()
    expect(await primaryPhone(contactId)).toBe("+27821119999")
  })

  it("DELETE of the primary phone clears the cache — the POPIA arm", async () => {
    // The load-bearing one. anonymisePlan erases via contact_phones; without this arm the number
    // would survive in primary_phone and the erasure would be a no-op where it matters most.
    const { orgId, contactId } = await seedContact("+27821110003")
    expect(await primaryPhone(contactId)).toBe("+27821110003")

    const { error } = await db.from("contact_phones").delete().eq("org_id", orgId).eq("contact_id", contactId)
    expect(error).toBeNull()
    expect(await primaryPhone(contactId)).toBeNull()
  })

  it("a contact with no phone rows derives NULL, not a stale value", async () => {
    const { contactId } = await seedContact(null)
    expect(await primaryPhone(contactId)).toBeNull()
  })
})

describe("trap 4 — a primary phone row can never be inactive (CD §10.1)", () => {
  it("the CHECK rejects deactivating a row that is still primary", async () => {
    const { orgId, contactId } = await seedContact("+27821110004")

    // The obvious "remove a number" implementation: flip is_active, leave is_primary. Without the
    // CHECK this succeeds and strands the contact — the row holds the unique primary slot while
    // being invisible to every reader, so primary_phone is NULL and no NEW primary can be inserted.
    const { error } = await db.from("contact_phones")
      .update({ is_active: false }).eq("org_id", orgId).eq("contact_id", contactId).eq("is_primary", true)

    expect(error, "the CHECK must reject primary+inactive").not.toBeNull()
    expect(await primaryPhone(contactId)).toBe("+27821110004")   // unchanged, not stranded
  })

  it("clearing is_primary alongside is_active is the correct removal, and frees the slot", async () => {
    const { orgId, contactId } = await seedContact("+27821110005")

    const { error: demote } = await db.from("contact_phones")
      .update({ is_primary: false, is_active: false }).eq("org_id", orgId).eq("contact_id", contactId).eq("is_primary", true)
    expect(demote).toBeNull()
    expect(await primaryPhone(contactId)).toBeNull()

    // The slot must be free immediately — this is what trap 4 would have blocked.
    const { error: insert } = await db.from("contact_phones")
      .insert({ org_id: orgId, contact_id: contactId, number: "+27821110006", phone_type: "mobile", is_primary: true, is_active: true })
    expect(insert, "a new primary must be insertable straight after a correct removal").toBeNull()
    expect(await primaryPhone(contactId)).toBe("+27821110006")
  })
})
