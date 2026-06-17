import { describe, it, expect, vi } from "vitest"

// V4 test mocks the shared strip engine so we can force a child-group error deterministically.
vi.mock("../anonymiseIdentity", () => ({ stripGroup: vi.fn() }))

import { isScreeningArtefactPurgeable, purgeApplicationScreeningArtefacts, purgeScreeningArtefactsForOrg } from "../screeningArtefactPurge"
import { stripGroup } from "../anonymiseIdentity"
import {
  DECLINED_APPLICANT_DELETE_TABLES,
  DECLINED_APPLICANT_STRIP_GROUPS,
} from "../anonymisePlan"

type PurgeDb = Parameters<typeof purgeApplicationScreeningArtefacts>[0]

/** Minimal chainable Supabase mock: every builder method returns the same thenable chain (resolves to an
 *  empty result); `update` is spied so a test can assert the pii_purged_at latch was / wasn't stamped. */
function makeDb() {
  const updateSpy = vi.fn()
  // Awaiting a plain (non-thenable) object yields the object itself → destructuring { data, error } off it
  // returns these props. No `then` needed (and we avoid making the mock a thenable).
  const makeChain = () => {
    const c: Record<string, unknown> = { data: [], error: null }
    const self = () => c
    c.select = vi.fn(self); c.delete = vi.fn(self); c.eq = vi.fn(self)
    c.in = vi.fn(self); c.is = vi.fn(self); c.or = vi.fn(self); c.insert = vi.fn(self)
    c.update = vi.fn((vals: Record<string, unknown>) => { updateSpy(vals); return c })
    c.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    return c
  }
  return {
    from: vi.fn(() => makeChain()),
    storage: { from: vi.fn(() => ({ remove: vi.fn(() => Promise.resolve({ error: null })) })) },
    updateSpy,
  }
}

/** Helpers: find a strip group by table, and assert it strips a given field. */
const groupFor = (table: string) => DECLINED_APPLICANT_STRIP_GROUPS.find((g) => g.table === table)
const fieldsOf = (table: string): string[] => Object.keys(groupFor(table)?.fields ?? {})

// isScreeningArtefactPurgeable is the IRREVERSIBLE guard — these assert exactly when it returns true.
// The row shape mirrors the module's private ApplicationRow; we cast through a minimal builder.
type Row = Parameters<typeof isScreeningArtefactPurgeable>[0]

const NOW = new Date("2026-06-15T00:00:00.000Z")
const longAgo = "2026-01-01T00:00:00.000Z"   // > 90d before NOW
const recent = "2026-06-01T00:00:00.000Z"    // < 90d before NOW

function row(over: Partial<Row>): Row {
  return {
    id: "app-1", org_id: "org-1",
    stage1_status: null, stage2_status: null, tenant_id: null,
    reviewed_at: null, prescreened_at: null, updated_at: null, pii_purged_at: null,
    ...over,
  } as Row
}

describe("isScreeningArtefactPurgeable — the 90-day IRREVERSIBLE guard", () => {
  it("purges a stage-2 declined application reviewed > 90d ago", () => {
    expect(isScreeningArtefactPurgeable(row({ stage2_status: "declined", reviewed_at: longAgo }), NOW)).toBe(true)
  })

  it("purges a withdrawn application reviewed > 90d ago", () => {
    expect(isScreeningArtefactPurgeable(row({ stage2_status: "withdrawn", reviewed_at: longAgo }), NOW)).toBe(true)
  })

  it("purges a stage-1 not_shortlisted application prescreened > 90d ago", () => {
    expect(isScreeningArtefactPurgeable(row({ stage1_status: "not_shortlisted", prescreened_at: longAgo }), NOW)).toBe(true)
  })

  it("does NOT purge before 90 days have passed", () => {
    expect(isScreeningArtefactPurgeable(row({ stage2_status: "declined", reviewed_at: recent }), NOW)).toBe(false)
  })

  it("does NOT purge a converted (approved) application, even if old", () => {
    expect(isScreeningArtefactPurgeable(row({ stage2_status: "approved", reviewed_at: longAgo }), NOW)).toBe(false)
  })

  it("does NOT purge a non-terminal application (in progress)", () => {
    expect(isScreeningArtefactPurgeable(row({ stage2_status: "screening_in_progress", reviewed_at: longAgo }), NOW)).toBe(false)
  })

  it("does NOT re-purge an already-purged application (idempotent)", () => {
    expect(isScreeningArtefactPurgeable(
      row({ stage2_status: "declined", reviewed_at: longAgo, pii_purged_at: longAgo }), NOW,
    )).toBe(false)
  })

  it("does NOT purge when the terminal-transition date cannot be determined (fail safe)", () => {
    expect(isScreeningArtefactPurgeable(row({ stage2_status: "declined", reviewed_at: null, updated_at: null }), NOW)).toBe(false)
  })

  it("falls back to updated_at when the specific terminal stamp is missing", () => {
    expect(isScreeningArtefactPurgeable(row({ stage2_status: "declined", reviewed_at: null, updated_at: longAgo }), NOW)).toBe(true)
  })
})

describe("declined-applicant purge SSOT (single 90-day tier — P-1 closure + folded old rule)", () => {
  it("covers all four P-1 screening-artefact tables", () => {
    const tables = new Set(DECLINED_APPLICANT_DELETE_TABLES.map((t) => t.table))
    expect(tables.has("screening_artifacts")).toBe(true)
    expect(tables.has("application_screening_lines")).toBe(true)
    expect(tables.has("application_bank_statement_classifications")).toBe(true)
    expect(tables.has("application_prescreens")).toBe(true)
  })

  it("strips the fitscore_* derived-PII columns from applications (P-1)", () => {
    const f = fieldsOf("applications")
    expect(f).toContain("fitscore_narrative")
    expect(f).toContain("fitscore_material_flags")
    expect(f).toContain("fitscore_components")
    expect(f).toContain("fitscore_component_snapshot")
  })

  it("folds in the retired rule's identity + financial columns (merged set)", () => {
    // From lib/rules/application/rejected-applicant-purge.ts (now deleted).
    const f = fieldsOf("applications")
    expect(f).toContain("id_number")
    expect(f).toContain("employer_name")
    expect(f).toContain("bank_statement_path")
    expect(f).toContain("searchworx_extracted_data")
    expect(f).toContain("gross_monthly_income_cents")
  })

  // V1 (70H F3 verification): the earlier hand-maintained subset silently DROPPED the primary applicant's
  // base identity and skipped the director/co-applicant/guarantor identity tables entirely. These lock the
  // plan-derived set so that gap can never reopen.
  it("V1: strips the primary applicant's base identity (was silently dropped)", () => {
    const f = fieldsOf("applications")
    for (const col of ["first_name", "last_name", "date_of_birth", "passport_number", "applicant_email", "applicant_phone", "current_landlord_name"]) {
      expect(f, col).toContain(col)
    }
  })

  it("V1: covers the director / co-applicant / guarantor identity tables (commercial + joint declines)", () => {
    expect(groupFor("application_co_applicants"), "co_applicants").toBeTruthy()
    expect(groupFor("application_directors"), "directors").toBeTruthy()
    expect(groupFor("application_guarantors"), "guarantors").toBeTruthy()
    // each must strip the SA ID number
    expect(fieldsOf("application_co_applicants")).toContain("id_number")
    expect(fieldsOf("application_directors")).toContain("id_number")
    expect(fieldsOf("application_guarantors")).toContain("id_number")
  })

  it("V1: co-applicants group keys on primary_application_id (not the phantom application_id)", () => {
    // The phantom keyColumn 42703'd → co-applicant PII silently survived erasure AND the purge.
    expect(groupFor("application_co_applicants")?.keyColumn).toBe("primary_application_id")
  })

  it("derived by construction: a strip-group table is never also a whole-row delete-table", () => {
    const deleteNames = new Set(DECLINED_APPLICANT_DELETE_TABLES.map((t) => t.table))
    for (const g of DECLINED_APPLICANT_STRIP_GROUPS) {
      expect(deleteNames.has(g.table), `${g.table} both stripped and deleted`).toBe(false)
    }
  })

  it("redacts the contact-PII surfaces the flat list missed (tokens / payments)", () => {
    expect(fieldsOf("application_tokens")).toContain("applicant_email")
    expect(fieldsOf("application_screening_payments")).toContain("paid_by_email")
  })

  it("screening_payments strips ONLY paid_by_email — the transaction record stays (CD F3 ruling)", () => {
    expect(fieldsOf("application_screening_payments")).toEqual(["paid_by_email"])
  })

  it("(b) HOLDS consent_verifications out of the AUTO purge pending counsel", () => {
    // It stays in ANONYMISE_PLAN (DSAR path strips it) but must NOT be in the automatic declined strip.
    expect(groupFor("consent_verifications")).toBeUndefined()
  })

  it("every delete-table with a storage path declares its bucket", () => {
    for (const t of DECLINED_APPLICANT_DELETE_TABLES) {
      if (t.storagePathColumn) expect(t.storageBucket, t.id).toBeTruthy()
    }
  })
})

describe("V4 — a non-self-healed strip error aborts BEFORE the one-way pii_purged_at latch", () => {
  // The swallow-then-mark-done trap that hid both 42703 plan-bugs: a child-identity strip can error while
  // its 0-row case looks normal. stripGroup now returns -1 on a real error and the executor must abort.
  it("throws and does NOT stamp pii_purged_at when a child identity-table strip errors", async () => {
    vi.mocked(stripGroup).mockImplementation(async (_db, group) => {
      if (group.table === "application_directors") return -1   // simulate a non-self-healed DB error
      if (group.table === "applications") return 1             // applications row stripped fine
      return 0                                                  // child tables with no rows — legitimately normal
    })
    const db = makeDb()
    const candidate = row({ stage2_status: "declined", reviewed_at: longAgo })

    await expect(
      purgeApplicationScreeningArtefacts(db as unknown as PurgeDb, candidate, NOW),
    ).rejects.toThrow(/application_directors/)

    // the one-way latch must never be stamped on a failed strip (else a later fix can't re-purge the row)
    expect(db.updateSpy).not.toHaveBeenCalled()
  })

  it("stamps pii_purged_at when every group strips cleanly (0-rows on child tables is fine)", async () => {
    vi.mocked(stripGroup).mockImplementation(async (_db, group) =>
      group.table === "applications" ? 1 : 0,   // applications stripped; child tables no-row (normal)
    )
    const db = makeDb()
    const candidate = row({ stage2_status: "declined", reviewed_at: longAgo })

    const did = await purgeApplicationScreeningArtefacts(db as unknown as PurgeDb, candidate, NOW)
    expect(did).toBe(true)
    // the marker update fired exactly once, carrying pii_purged_at
    const stampCalls = db.updateSpy.mock.calls.filter((c) => "pii_purged_at" in (c[0] as object))
    expect(stampCalls).toHaveLength(1)
  })
})

/** Table-aware org db for the orchestrator: applications→[candidate], legal_hold_events→holdRows,
 *  tenants.maybeSingle→{auth_user_id}, audit_log/insert→ok. Awaiting any chain yields {data,error}. */
function makeOrgDb(opts: { candidate: Row; authUserId: string | null; holdRows: unknown[] }): PurgeDb {
  const dataFor = (t: string): unknown[] => {
    if (t === "applications") return [opts.candidate]
    if (t === "legal_hold_events") return opts.holdRows
    return []
  }
  const chain = (table: string) => {
    const c: Record<string, unknown> = { data: dataFor(table), error: null }
    for (const m of ["select", "eq", "is", "or", "order", "insert", "update", "delete"]) c[m] = () => c
    c.maybeSingle = () => Promise.resolve({ data: table === "tenants" ? { auth_user_id: opts.authUserId } : null, error: null })
    return c
  }
  return { from: (t: string) => chain(t) } as unknown as PurgeDb
}

describe("purge orchestrator — litigation-hold gate (F3 amendment §4, fail-closed)", () => {
  const candidate = () => row({ id: "app-1", org_id: "org-1", stage2_status: "declined", reviewed_at: longAgo, tenant_id: "t-1" })
  const placedHold = [{ id: "h1", event_type: "hold_placed", lift_event_id: null, scope_type: "application", scope_id: "app-1" }]

  it("defers an eligible candidate that is on hold (skipped_on_hold, not purged)", async () => {
    const db = makeOrgDb({ candidate: candidate(), authUserId: "sub-1", holdRows: placedHold })
    const r = await purgeScreeningArtefactsForOrg(db, "org-1", NOW)
    expect(r.evaluated).toBe(1)
    expect(r.skipped_on_hold).toBe(1)
    expect(r.purged).toBe(0)
  })

  it("defers an eligible candidate whose subject can't be resolved (subject_missing)", async () => {
    const db = makeOrgDb({ candidate: candidate(), authUserId: null, holdRows: [] })
    const r = await purgeScreeningArtefactsForOrg(db, "org-1", NOW)
    expect(r.skipped_on_hold).toBe(1)
    expect(r.purged).toBe(0)
  })
})
