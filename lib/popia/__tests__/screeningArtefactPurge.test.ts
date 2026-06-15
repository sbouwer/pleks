import { describe, it, expect } from "vitest"
import { isScreeningArtefactPurgeable } from "../screeningArtefactPurge"
import {
  DECLINED_APPLICANT_DELETE_TABLES,
  DECLINED_APPLICANT_PURGE_COLUMNS,
} from "../anonymisePlan"

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
    expect(DECLINED_APPLICANT_PURGE_COLUMNS).toHaveProperty("fitscore_narrative")
    expect(DECLINED_APPLICANT_PURGE_COLUMNS).toHaveProperty("fitscore_material_flags")
  })

  it("folds in the retired rule's identity + financial columns (merged set)", () => {
    // From lib/rules/application/rejected-applicant-purge.ts (now deleted).
    expect(DECLINED_APPLICANT_PURGE_COLUMNS).toHaveProperty("id_number")
    expect(DECLINED_APPLICANT_PURGE_COLUMNS).toHaveProperty("employer_name")
    expect(DECLINED_APPLICANT_PURGE_COLUMNS).toHaveProperty("bank_statement_path")
    expect(DECLINED_APPLICANT_PURGE_COLUMNS).toHaveProperty("searchworx_extracted_data")
    expect(DECLINED_APPLICANT_PURGE_COLUMNS).toHaveProperty("gross_monthly_income_cents")
  })

  it("every delete-table with a storage path declares its bucket", () => {
    for (const t of DECLINED_APPLICANT_DELETE_TABLES) {
      if (t.storagePathColumn) expect(t.storageBucket, t.id).toBeTruthy()
    }
  })
})
