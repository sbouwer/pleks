/**
 * test/db/surety-party-predicate.dbtest.ts — the SQL party predicates agree with the TS ones (BUILD_72 P1-R1/R3a/R7a)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  One predicate, two languages, three times: `is_surety_party()` ⇄ `isSuretyParty`,
 *         `is_juristic_party_context()` ⇄ `isJuristicForCopy`, and `screening_party_kind()` ⇄ `partyKind`
 *         (005 ⇄ lib/applications/juristicParties.ts). The view's `party_kind` is what the reminder cron routes
 *         copy by, so a disagreement sends a residential party director copy, or a company surety joint-rental
 *         copy. Every party marker shape the schema admits (role ∈ co_applicant | guarantor | NULL, crossed
 *         with is_surety_director) is planted on each of several application contexts — juristic by either
 *         marker, an unincorporated company, the column defaults — and the view's answer is compared row by
 *         row with the TS answer. All three kinds must occur, so a predicate that answered one value for
 *         everything fails here.
 *         R7a adds a fourth pair, `is_director_surety()` ⇄ `isDirectorSurety` — the cron's director-copy gate —
 *         read as a PostgREST computed field over every role × is_surety_director × declared_director shape.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"
import { isDirectorSurety, isJuristicForCopy, partyKind } from "@/lib/applications/juristicParties"

const db = svc()

const SHAPES: ReadonlyArray<{ role: string | null; is_surety_director: boolean }> = [
  { role: "co_applicant", is_surety_director: false },
  { role: "co_applicant", is_surety_director: true },
  { role: "guarantor", is_surety_director: false },
  { role: "guarantor", is_surety_director: true },
  { role: null, is_surety_director: false },
  { role: null, is_surety_director: true },
]

type AppCtx = { entity_type?: string; applicant_type?: string | null; company_info?: Record<string, unknown> | null }
const CONTEXTS: ReadonlyArray<{ label: string; app: AppCtx }> = [
  { label: "column defaults (residential)", app: {} },
  { label: "entity_type organisation + pty_ltd", app: { entity_type: "organisation", company_info: { companyType: "pty_ltd" } } },
  { label: "applicant_type company + trust (entity_type default)", app: { applicant_type: "company", company_info: { companyType: "trust" } } },
  { label: "applicant_type company + cc", app: { applicant_type: "company", company_info: { companyType: "cc" } } },
  { label: "applicant_type company + npc", app: { applicant_type: "company", company_info: { companyType: "npc" } } },
  { label: "applicant_type company + partnership (unincorporated)", app: { applicant_type: "company", company_info: { companyType: "partnership" } } },
  { label: "applicant_type company, no company_info", app: { applicant_type: "company", company_info: null } },
  { label: "applicant_type guarantor + pty_ltd (no org marker)", app: { applicant_type: "guarantor", company_info: { companyType: "pty_ltd" } } },
]

describe("screening_party_kind() ⇄ partyKind — v_application_screening_lines.party_kind", () => {
  let orgId: string
  const planted = new Map<string, { shape: (typeof SHAPES)[number]; ctx: (typeof CONTEXTS)[number] }>()
  const appIds: string[] = []

  beforeAll(async () => {
    const seeded = await seedLedgerCase(db, { invoices: [] })
    orgId = seeded.orgId
    const { data: listing, error: listingErr } = await db.from("listings")
      .insert({ org_id: orgId, unit_id: seeded.unitId, property_id: seeded.propertyId, asking_rent_cents: 1_000_000 })
      .select("id").single()
    if (listingErr) throw new Error(`seed listing: ${listingErr.message}`)

    for (const [c, ctx] of CONTEXTS.entries()) {
      const { data: app, error: appErr } = await db.from("applications")
        .insert({ org_id: orgId, listing_id: listing.id, unit_id: seeded.unitId, first_name: "Lead", last_name: `Applicant ${c}`, applicant_email: `lead-${randomUUID()}@example.test`, ...ctx.app })
        .select("id").single()
      if (appErr) throw new Error(`seed application ${ctx.label}: ${appErr.message}`)
      appIds.push(app.id as string)
      for (const [i, shape] of SHAPES.entries()) {
        // Distinct emails: surety parties are unique per person per application (uq_co_applicants_live_surety_email).
        const { data, error } = await db.from("application_co_applicants")
          .insert({ org_id: orgId, primary_application_id: app.id, co_applicant_index: i + 1, applicant_email: `party-${c}-${i}@example.test`, ...shape })
          .select("id").single()
        if (error) throw new Error(`plant ${ctx.label} shape ${i}: ${error.message}`)
        planted.set(data.id as string, { shape, ctx })
      }
    }
  }, 120_000)
  afterAll(() => { if (orgId) teardownOrg(orgId) })

  // The TS side reads the application row as stored, so column defaults are applied exactly as SQL sees them.
  async function storedApps() {
    const { data, error } = await db.from("applications").select("id, entity_type, applicant_type, company_info").eq("org_id", orgId).in("id", appIds)
    expect(error).toBeNull()
    return new Map((data ?? []).map((a) => [a.id as string, a]))
  }

  it("every planted shape × context reads the same in SQL as in TS", async () => {
    const apps = await storedApps()
    const { data, error } = await db.from("v_application_screening_lines")
      .select("application_id, subject_id, party_kind")
      .eq("org_id", orgId)
      .in("application_id", appIds)
      .eq("subject_type", "co_applicant")
    expect(error).toBeNull()
    expect(data).toHaveLength(SHAPES.length * CONTEXTS.length)
    for (const row of data ?? []) {
      const p = planted.get(row.subject_id as string)
      expect(p, "the view returned a row that was not planted").toBeDefined()
      const expected = partyKind({ party: p!.shape, isJuristic: isJuristicForCopy(apps.get(row.application_id as string)!) })
      expect(row.party_kind, `${p!.ctx.label}: role=${p!.shape.role} is_surety_director=${p!.shape.is_surety_director}`).toBe(expected)
    }
  }, 60_000)

  it("all three kinds occur, and juristic-ness splits on both markers — the comparison is not vacuous", async () => {
    const apps = await storedApps()
    const juristic = CONTEXTS.map((_, c) => isJuristicForCopy(apps.get(appIds[c])!))
    expect(juristic).toEqual([false, true, true, true, true, false, false, false])
    const { data, error } = await db.from("v_application_screening_lines").select("party_kind").eq("org_id", orgId).in("application_id", appIds).eq("subject_type", "co_applicant")
    expect(error).toBeNull()
    expect(new Set((data ?? []).map((r) => r.party_kind))).toEqual(new Set(["co_applicant", "guarantor", "surety"]))
  }, 60_000)
})

describe("is_director_surety() ⇄ isDirectorSurety — who may receive director copy (P1-R7a)", () => {
  let orgId: string
  type Shape = { role: string | null; is_surety_director: boolean; declared_director: boolean | null }
  const planted = new Map<string, Shape>()
  const TRI = [null, false, true] as const

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
    let i = 0
    for (const role of ["co_applicant", "guarantor", null])
      for (const is_surety_director of [false, true]) // NOT NULL in the schema
        for (const declared_director of TRI) {
          const shape: Shape = { role, is_surety_director, declared_director }
          i += 1
          const { data, error } = await db.from("application_co_applicants")
            .insert({ org_id: orgId, primary_application_id: app.id, co_applicant_index: i, applicant_email: `dir-${i}@example.test`, ...shape })
            .select("id").single()
          if (error) throw new Error(`plant shape ${i}: ${error.message}`)
          planted.set(data.id as string, shape)
        }
  }, 120_000)
  afterAll(() => { if (orgId) teardownOrg(orgId) })

  it("every role × registry flag × declared answer reads the same in SQL as in TS, and both answers occur", async () => {
    const { data, error } = await db.from("application_co_applicants")
      .select("id, is_director_surety")
      .eq("org_id", orgId)
    expect(error).toBeNull()
    expect(data).toHaveLength(18)
    for (const row of data ?? []) {
      const shape = planted.get(row.id as string)
      expect(shape, "a row that was not planted").toBeDefined()
      expect(row.is_director_surety, JSON.stringify(shape)).toBe(isDirectorSurety(shape!))
    }
    expect(new Set((data ?? []).map((r) => r.is_director_surety))).toEqual(new Set([true, false]))
  }, 60_000)

  it("the registry flag alone is not a director in SQL either; a declared yes is (ruling on #332, both directions)", async () => {
    const { data, error } = await db.from("application_co_applicants")
      .select("id, is_director_surety")
      .eq("org_id", orgId)
    expect(error).toBeNull()
    const read = (want: Shape) => (data ?? []).find((r) => {
      const s = planted.get(r.id as string)!
      return s.role === want.role && s.is_surety_director === want.is_surety_director && s.declared_director === want.declared_director
    })?.is_director_surety
    expect(read({ role: "guarantor", is_surety_director: true, declared_director: false })).toBe(false)
    expect(read({ role: "guarantor", is_surety_director: true, declared_director: null })).toBe(false)
    expect(read({ role: "guarantor", is_surety_director: false, declared_director: true })).toBe(true)
  }, 60_000)
})
