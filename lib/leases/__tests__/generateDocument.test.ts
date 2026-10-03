/**
 * lib/leases/__tests__/generateDocument.test.ts — a failed upload must never leave a generated_doc_path behind (B5)
 *
 * Notes:  Every reader of `leases.generated_doc_path` (checkPrerequisites, sendForSigning, the download route) treats a
 *         non-null path as proof the file exists. Until 2026-10-03 the upload result was discarded and the path written
 *         anyway, so a lease passed its prerequisites with no document. Both directions: an upload error throws before
 *         any lease write; a clean upload writes the path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const state = vi.hoisted(() => ({
  uploadError: null as { message: string } | null,
  leaseUpdates: [] as Record<string, unknown>[],
  uploads: [] as string[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => {
    // A chainable query: every filter returns the chain; awaiting it (or .single()) yields the table's row.
    const rows: Record<string, unknown> = {
      leases: { id: "lease1", org_id: "org1", lease_type: "residential", start_date: "2026-11-01", tenant_view: null, units: null },
      organisations: { id: "org1", name: "Agency" },
    }
    const query = (table: string) => {
      const result = { data: rows[table] ?? [], error: null, count: 0 }
      const chain: Record<string, unknown> = {
        then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
        single: async () => result,
        update: (patch: Record<string, unknown>) => {
          if (table === "leases") state.leaseUpdates.push(patch)
          return chain
        },
      }
      for (const m of ["select", "eq", "in", "is", "order"]) chain[m] = () => chain
      return chain
    }
    return {
      from: query,
      storage: {
        from: () => ({
          upload: async (path: string) => {
            state.uploads.push(path)
            return { data: state.uploadError ? null : { path }, error: state.uploadError }
          },
        }),
      },
    }
  },
}))
vi.mock("@/lib/leases/bankDetails", () => ({
  getLessorBankDetails: async () => ({ bankName: "", accountHolder: "", accountNumber: "", branchCode: "", fullDetails: "" }),
}))
vi.mock("@/lib/deposits/interestConfig", () => ({
  resolveDepositInterestConfig: async () => null,
  resolveEffectiveRate: async () => null,
}))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(async () => undefined) }))

import { generateLeaseDocument } from "../generateDocument"

beforeEach(() => {
  state.uploadError = null
  state.leaseUpdates = []
  state.uploads = []
})

describe("generateLeaseDocument — the stored path is written only after the file is stored", () => {
  it("an upload error throws and writes nothing to the lease", async () => {
    state.uploadError = { message: "Bucket not found" }
    await expect(generateLeaseDocument("lease1", "org1")).rejects.toThrow(/upload failed: Bucket not found/)
    expect(state.uploads).toEqual(["orgs/org1/leases/lease1/lease_draft.docx"])
    expect(state.leaseUpdates).toEqual([])
  })

  it("a clean upload writes generated_doc_path to the stored key", async () => {
    const out = await generateLeaseDocument("lease1", "org1")
    expect(out.storagePath).toBe("orgs/org1/leases/lease1/lease_draft.docx")
    expect(state.leaseUpdates).toHaveLength(1)
    expect(state.leaseUpdates[0].generated_doc_path).toBe("orgs/org1/leases/lease1/lease_draft.docx")
  })
})
