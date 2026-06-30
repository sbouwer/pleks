/**
 * lib/applications/applicantAdapter.test.ts — the uniform applicant adapter (ADDENDUM_14R §6, Phase 1).
 *
 * Proves the load-bearing seam: lead (applications row) + co (application_co_applicants row) NORMALISE to one
 * shape; the at-rest crypto boundary round-trips (encrypt on write column, decrypt on read map); and writes ROUTE
 * to the correct table. vitest doesn't load .env, so we set a throwaway ENCRYPTION_KEY here for the encrypt path.
 */
import { describe, it, expect, beforeAll } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptIdNumber } from "@/lib/crypto/idNumber"
import { encrypt } from "@/lib/crypto/encryption"
import {
  mapLeadRow, mapCoRow, leadColumns, coColumns, writeApplicant,
  type LeadRow, type UniformApplicant,
} from "./applicantAdapter"

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
})

/** Records every .from(table).update(vals).eq(col, val) so we can assert the write was routed correctly. */
function mockDb() {
  const calls: { table: string; vals: Record<string, unknown>; eqCol: string; eqVal: string }[] = []
  const db = {
    from(table: string) {
      return {
        update(vals: Record<string, unknown>) {
          return {
            eq(eqCol: string, eqVal: string) {
              calls.push({ table, vals, eqCol, eqVal })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

const TOP_KEYS = ["ref", "isLead", "role", "identity", "employment", "income", "obligations", "documents", "consentGiven", "status", "isSuretyDirector", "startedAt", "declinedAt", "applicantType", "companyInfo", "sectionData"] as const
const IDENTITY_KEYS = ["firstName", "lastName", "idType", "idNumber", "dob", "email", "phone", "maritalStatus", "matrimonialRegime", "spouseInfo", "addresses"] as const

describe("mapLeadRow / mapCoRow — normalise to ONE shape", () => {
  const lead: UniformApplicant = mapLeadRow({ first_name: "Lead", last_name: "One", stage1_consent_given: true })
  const co: UniformApplicant = mapCoRow({ id: "co-123", first_name: "Co", last_name: "Two" })

  it("lead and co expose identical top-level + identity keys", () => {
    expect(new Set(Object.keys(lead))).toEqual(new Set(TOP_KEYS))
    expect(new Set(Object.keys(co))).toEqual(new Set(TOP_KEYS))
    expect(new Set(Object.keys(lead.identity))).toEqual(new Set(IDENTITY_KEYS))
    expect(new Set(Object.keys(co.identity))).toEqual(new Set(IDENTITY_KEYS))
  })

  it("tags the lead vs co correctly (ref / isLead / role)", () => {
    expect(lead.ref).toBe("primary")
    expect(lead.isLead).toBe(true)
    expect(lead.role).toBe("primary")
    expect(co.ref).toBe("co_co-123")
    expect(co.isLead).toBe(false)
    expect(co.role).toBe("co_applicant")
    expect(co.documents.subjectRef).toBe("co-123")
  })

  it("derives role: explicit guarantor OR surety director → guarantor", () => {
    expect(mapCoRow({ id: "a", role: "guarantor" }).role).toBe("guarantor")
    expect(mapCoRow({ id: "b", is_surety_director: true }).role).toBe("guarantor")
    expect(mapCoRow({ id: "c", role: "co_applicant" }).role).toBe("co_applicant")
    expect(mapCoRow({ id: "d", is_surety_director: true }).isSuretyDirector).toBe(true)
  })
})

describe("status derivation", () => {
  it("lead: consent → completed; draft started → in_progress; blank → not_started", () => {
    expect(mapLeadRow({ stage1_consent_given: true }).status).toBe("completed")
    expect(mapLeadRow({ draft_saved_at: "2026-06-01T00:00:00Z" }).status).toBe("in_progress")
    expect(mapLeadRow({ first_name: "Started" }).status).toBe("in_progress")
    expect(mapLeadRow({}).status).toBe("not_started")
  })
  it("co: consent → completed; link opened (started_at) → in_progress; invited → not_started", () => {
    expect(mapCoRow({ id: "a", stage1_consent_given: true }).status).toBe("completed")
    expect(mapCoRow({ id: "b", started_at: "2026-06-01T00:00:00Z" }).status).toBe("in_progress")
    expect(mapCoRow({ id: "c" }).status).toBe("not_started")
  })
})

describe("read boundary — decrypts id/dob/spouse", () => {
  it("an encrypted id_number maps back to the raw value", () => {
    const raw = "9001015800089"
    const row: LeadRow = { id_number: encrypt(raw), date_of_birth: encrypt("1990-01-01") }
    const mapped = mapLeadRow(row)
    expect(mapped.identity.idNumber).toBe(raw)
    expect(mapped.identity.dob).toBe("1990-01-01")
  })
  it("a raw (legacy/fake) id_number passes through untouched", () => {
    expect(mapCoRow({ id: "x", id_number: "raw-no-crypto" }).identity.idNumber).toBe("raw-no-crypto")
  })
  it("decrypts the spouse_info idNumber", () => {
    const mapped = mapLeadRow({ spouse_info: { isCoApplicant: true, idNumber: encrypt("8505050050081") } })
    expect((mapped.identity.spouseInfo as { idNumber?: string })?.idNumber).toBe("8505050050081")
  })
  it("co current_address folds into the uniform addresses array", () => {
    expect(mapCoRow({ id: "x", current_address: { line1: "1 Main St" } }).identity.addresses).toEqual([{ line1: "1 Main St" }])
    expect(mapCoRow({ id: "y" }).identity.addresses).toEqual([])
  })
})

describe("write boundary — leadColumns / coColumns", () => {
  it("leadColumns encrypts id (round-trips) + computes a hash + only writes present keys", () => {
    const cols = leadColumns({ firstName: "A", idNumber: "9001015800089" })
    expect(cols.first_name).toBe("A")
    expect(decryptIdNumber(cols.id_number as string)).toBe("9001015800089")
    expect(typeof cols.id_number_hash).toBe("string")
    expect("last_name" in cols).toBe(false) // absent key not written
    expect("applicant_phone" in cols).toBe(false)
  })

  it("leadColumns maps addresses → applicant_addresses capped at 5", () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => ({ line1: `addr ${n}` }))
    expect(leadColumns({ addresses: many }).applicant_addresses as unknown[]).toHaveLength(5)
  })

  it("coColumns folds addresses → single current_address, defaults id_type, drops lead-only keys", () => {
    const cols = coColumns({ addresses: [{ line1: "1 Main" }, { line1: "ignored" }], idType: "", idNumber: "9001015800089", incomeSources: [{ x: 1 }], applicantType: "company" })
    expect(cols.current_address).toEqual({ line1: "1 Main" })
    expect(cols.id_type).toBe("sa_id") // present-but-empty defaults to sa_id (co-save parity)
    expect(decryptIdNumber(cols.id_number as string)).toBe("9001015800089")
    expect("income_sources" in cols).toBe(false) // co row has no such column (14R §2)
    expect("applicant_type" in cols).toBe(false)
  })

  it("consentGiven stamps the stage1 consent columns on both tables", () => {
    const lead = leadColumns({ consentGiven: true, consentAt: "2026-06-01T00:00:00Z", consentIp: "test-ip" })
    expect(lead.stage1_consent_given).toBe(true)
    expect(lead.stage1_consent_given_at).toBe("2026-06-01T00:00:00Z")
    expect(lead.stage1_consent_ip).toBe("test-ip")
    const co = coColumns({ consentGiven: true, consentAt: "2026-06-01T00:00:00Z" })
    expect(co.stage1_consent_given).toBe(true)
  })
})

describe("writeApplicant — routes to the correct table", () => {
  it("ref 'primary' updates the applications row by id", async () => {
    const { db, calls } = mockDb()
    const res = await writeApplicant(db, "app-1", "primary", { firstName: "Lead" })
    expect(res.error).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: "applications", eqCol: "id", eqVal: "app-1" })
    expect(calls[0]?.vals.first_name).toBe("Lead")
  })

  it("ref 'co_<id>' updates the co-applicant row by its own id (not the application id)", async () => {
    const { db, calls } = mockDb()
    await writeApplicant(db, "app-1", "co_co-9", { firstName: "Co" })
    expect(calls[0]).toMatchObject({ table: "application_co_applicants", eqCol: "id", eqVal: "co-9" })
  })

  it("an empty patch writes nothing (no db call)", async () => {
    const { db, calls } = mockDb()
    const res = await writeApplicant(db, "app-1", "primary", {})
    expect(res.error).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("consentGiven without consentAt is auto-stamped", async () => {
    const { db, calls } = mockDb()
    await writeApplicant(db, "app-1", "primary", { consentGiven: true })
    expect(calls[0]?.vals.stage1_consent_given).toBe(true)
    expect(typeof calls[0]?.vals.stage1_consent_given_at).toBe("string")
  })
})
