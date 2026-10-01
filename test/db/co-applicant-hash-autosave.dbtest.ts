/**
 * test/db/co-applicant-hash-autosave.dbtest.ts — a draft autosave never nulls a stored id_number_hash (BUILD_72 P1-R4)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db); drives the real save route by its token
 *
 * Notes:  CD's planted probe: autosave a row, re-read, hash unchanged. Before P1-R4 the save route spread
 *         idNumberColumns(body.idNumber) on every save, so a draft without the ID field wrote
 *         id_number = id_number_hash = null over the hash the roster set at insert. The hash is the identity
 *         key the surety dedup and the Phase 2 director match read; a NULL one is skipped by a partial index.
 *         Both directions: a blank draft leaves the pair intact, and a draft that DOES carry an id rewrites it.
 *         Also probes uq_co_applicants_live_id_hash (R1-b), the key the never-null hash exists to serve.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"
import { hashIdNumber, idNumberColumns } from "@/lib/crypto/idNumber"
import { POST } from "@/app/api/applications/co-applicant/[token]/save/route"

const db = svc()
// Synthetic, Luhn-valid SA IDs — test fixtures, not people.
const ID_A = "8001015009087"
const ID_B = "9202204720082"

let caller = 0  // a fresh client IP per request, so the route's per-IP rate limit never decides a case
async function save(token: string, body: Record<string, unknown>) {
  caller += 1
  const req = new NextRequest(`http://localhost/api/applications/co-applicant/${token}/save`, {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${caller}` },
  })
  return POST(req, { params: Promise.resolve({ token }) })
}

describe("co-applicant save route — id_number_hash survives a draft autosave", () => {
  let orgId: string
  let coId: string
  let token: string

  beforeAll(async () => {
    const seeded = await seedLedgerCase(db, { invoices: [] })
    orgId = seeded.orgId
    const { data: listing, error: listingErr } = await db.from("listings")
      .insert({ org_id: orgId, unit_id: seeded.unitId, property_id: seeded.propertyId, asking_rent_cents: 1_000_000 })
      .select("id").single()
    if (listingErr) throw new Error(`seed listing: ${listingErr.message}`)
    const { data: app, error: appErr } = await db.from("applications")
      .insert({ org_id: orgId, listing_id: listing.id, unit_id: seeded.unitId, first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test` })
      .select("id").single()
    if (appErr) throw new Error(`seed application: ${appErr.message}`)
    const { data: co, error: coErr } = await db.from("application_co_applicants")
      .insert({ org_id: orgId, primary_application_id: app.id, applicant_email: `co-${randomUUID()}@example.test`, role: "guarantor", ...idNumberColumns(ID_A) })
      .select("id, access_token").single()
    if (coErr) throw new Error(`seed co-applicant: ${coErr.message}`)
    coId = co.id as string
    token = co.access_token as string
  }, 60_000)
  afterAll(() => { if (orgId) teardownOrg(orgId) })

  async function reread() {
    const { data, error } = await db.from("application_co_applicants").select("id_number, id_number_hash, first_name").eq("id", coId).eq("org_id", orgId).single()
    expect(error).toBeNull()
    return data!
  }

  it("a draft with NO id leaves the stored id and hash exactly as they were", async () => {
    const before = await reread()
    expect(before.id_number_hash).toBe(hashIdNumber(ID_A))
    const res = await save(token, { draft: true, firstName: "Sue" })
    expect(res.status).toBe(200)
    const after = await reread()
    expect(after.first_name, "the draft itself was saved").toBe("Sue")
    expect(after.id_number_hash).toBe(before.id_number_hash)
    expect(after.id_number).toBe(before.id_number)
  }, 60_000)

  it("a draft with a BLANK id is the same as no id", async () => {
    const res = await save(token, { draft: true, firstName: "Sue", idNumber: "   " })
    expect(res.status).toBe(200)
    expect((await reread()).id_number_hash).toBe(hashIdNumber(ID_A))
  }, 60_000)

  it("KNOWN-GOOD: a draft that carries an id still rewrites the pair", async () => {
    const res = await save(token, { draft: true, firstName: "Sue", idNumber: ID_B })
    expect(res.status).toBe(200)
    expect((await reread()).id_number_hash).toBe(hashIdNumber(ID_B))
  }, 60_000)

  describe("uq_co_applicants_live_id_hash — one live party row per human per application (R1-b)", () => {
    async function plant(extra: Record<string, unknown>) {
      const { data: app, error } = await db.from("application_co_applicants").select("primary_application_id").eq("id", coId).eq("org_id", orgId).single()
      if (error || !app) throw new Error(`plant: ${error?.message}`)
      return db.from("application_co_applicants")
        .insert({ org_id: orgId, primary_application_id: app.primary_application_id, applicant_email: `p-${randomUUID()}@example.test`, ...extra })
    }

    it("FIRES: the same ID again in ANOTHER role, under a different email", async () => {
      // The live row holds ID_B (previous case). A joint co-applicant with the same ID is the same human.
      const dupe = await plant({ role: "co_applicant", ...idNumberColumns(ID_B) })
      expect(dupe.error?.code).toBe("23505")
    }, 60_000)

    it("KNOWN-GOOD: rows with no ID are not constrained against each other", async () => {
      expect((await plant({ role: "co_applicant" })).error).toBeNull()
      expect((await plant({ role: "co_applicant" })).error).toBeNull()
    }, 60_000)

    it("KNOWN-GOOD: a declined row frees the key for a replacement", async () => {
      const declined = await db.from("application_co_applicants").update({ declined_at: new Date().toISOString(), decline_reason: "replaced" }).eq("id", coId).eq("org_id", orgId)
      expect(declined.error).toBeNull()
      expect((await plant({ role: "guarantor", ...idNumberColumns(ID_B) })).error).toBeNull()
    }, 60_000)
  })
})
