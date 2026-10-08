/**
 * lib/popia/__tests__/exportReview.test.ts — an access request's export records the rows it held back for review on
 * the request (DSAR follow-up 3), and keeps them out of the subject's own file, which carries only their count.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const REVIEW = [{ table: "applications" as const, id: "app-spouse", reason: "matched by email only" }]
const writes: Array<{ table: string; op: string; payload: unknown }> = []
const uploads: Array<{ name: string; bytes: Buffer }> = []
let linkError: { message: string } | null = null

function fakeDb() {
  function builder(table: string) {
    let op = "select"
    let payload: unknown = null
    const b: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "order", "is", "limit"]) b[m] = () => b
    b.insert = (p: unknown) => { op = "insert"; payload = p; writes.push({ table, op, payload }); return b }
    b.update = (p: unknown) => { op = "update"; payload = p; writes.push({ table, op, payload }); return b }
    const rows: Record<string, unknown> = {
      popia_exports: { id: "exp1", pdf_storage_path: "p.pdf", json_storage_path: "d.json", zip_storage_path: null, manifest_hash: "h", manifest_summary: {}, expires_at: "x" },
      organisations: { name: "Agency" },
    }
    const row = () => rows[table] ?? null
    b.single = async () => ({ data: row(), error: null })
    b.maybeSingle = async () => ({ data: row(), error: null })
    b.then = (res: (v: unknown) => void) =>
      res(table === "data_subject_requests" && op === "update" ? { error: linkError } : { data: [], count: 0, error: null })
    return b
  }
  return { from: builder }
}

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => fakeDb() }))
vi.mock("@/lib/exports/bundle", () => ({
  generateBundle: async (artefacts: Array<{ name: string; bytes: Buffer }>) => {
    uploads.push(...artefacts)
    return { storage_paths: { "report.pdf": "p.pdf", "data.json": "d.json" }, manifest_hash: "h", artefact_hashes: {}, total_bytes: 1 }
  },
  signedDownloadUrl: async () => "https://signed",
}))
vi.mock("../anonymiseIdentity", () => ({
  resolveSubject: async () => ({
    orgId: "org1", userId: null, contactId: null, tenantId: null, landlordId: null, applicationIds: [], coApplicants: [], needsReview: REVIEW,
  }),
  subjectLeaseIds: async () => [],
}))

import { generateExport } from "../export"
import type { DataSubjectRequest } from "../requests"

const request = {
  id: "dsr1", org_id: "org1", subject_user_id: null, subject_email: "home@x.com", subject_full_name: "Jane", request_type: "access",
} as unknown as DataSubjectRequest

describe("generateExport — review rows (DSAR follow-up 3)", () => {
  beforeEach(() => { writes.length = 0; uploads.length = 0; linkError = null })

  it("persists the held-back rows on the request, beside the export link", async () => {
    await generateExport(request, "u-officer")
    const link = writes.find((w) => w.table === "data_subject_requests" && w.op === "update")
    expect(link?.payload).toEqual({ export_id: "exp1", erasure_records_affected: { ambiguous_matches: REVIEW } })
  })

  it("the subject's file carries the count, never the held-back row", async () => {
    await generateExport(request, "u-officer")
    const json = uploads.find((u) => u.name === "data.json")!.bytes.toString("utf8")
    expect(JSON.parse(json).data.pending_review).toBe(1)
    expect(json).not.toContain("app-spouse")
  })

  it("a failed request write throws, so the request is never completed without its record", async () => {
    linkError = { message: "boom" }
    await expect(generateExport(request, "u-officer")).rejects.toThrow(/request link failed/)
  })
})
