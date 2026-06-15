import { describe, it, expect } from "vitest"
import { isScreeningArtefactPurgeable } from "../screeningArtefactPurge"
import {
  DECLINED_APPLICANT_DELETE_TABLES,
  DECLINED_APPLICANT_STRIP_GROUPS,
} from "../anonymisePlan"

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

  it("also redacts the contact-PII surfaces the flat list missed (tokens / payments / consent)", () => {
    expect(fieldsOf("application_tokens")).toContain("applicant_email")
    expect(fieldsOf("application_screening_payments")).toContain("paid_by_email")
    expect(fieldsOf("consent_verifications")).toContain("target_email")
  })

  it("every delete-table with a storage path declares its bucket", () => {
    for (const t of DECLINED_APPLICANT_DELETE_TABLES) {
      if (t.storagePathColumn) expect(t.storageBucket, t.id).toBeTruthy()
    }
  })
})
