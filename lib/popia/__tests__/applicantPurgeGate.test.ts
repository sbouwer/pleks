import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/legal/holds", () => ({ isOnHold: vi.fn() }))

import { isOnHold } from "@/lib/legal/holds"
import { claimApplicantPurgeSlot, resolveSubjectAuthUserId } from "../applicantPurgeGate"

const db = {} as Parameters<typeof claimApplicantPurgeSlot>[0]
const holdStub = { id: "h" } as unknown as Awaited<ReturnType<typeof isOnHold>>

describe("claimApplicantPurgeSlot — F3 fail-closed gate (SPEC §10.9–12)", () => {
  it("application on hold → hold_active_application", async () => {
    vi.mocked(isOnHold).mockImplementation(async (_db, a) => (a.scopeType === "application" ? holdStub : null))
    const r = await claimApplicantPurgeSlot(db, { applicationId: "app-1", subjectAuthUserId: "sub-1" })
    expect(r).toEqual({ ok: false, reason: "hold_active_application" })
  })

  it("subject on hold (application clear) → hold_active_subject", async () => {
    vi.mocked(isOnHold).mockImplementation(async (_db, a) => (a.scopeType === "subject" ? holdStub : null))
    const r = await claimApplicantPurgeSlot(db, { applicationId: "app-1", subjectAuthUserId: "sub-1" })
    expect(r).toEqual({ ok: false, reason: "hold_active_subject" })
  })

  it("both clear → ok:true", async () => {
    vi.mocked(isOnHold).mockResolvedValue(null)
    const r = await claimApplicantPurgeSlot(db, { applicationId: "app-1", subjectAuthUserId: "sub-1" })
    expect(r.ok).toBe(true)
  })

  it("null subjectAuthUserId → subject_missing, and isOnHold is never called (fail-closed, no purge-allow)", async () => {
    vi.mocked(isOnHold).mockClear()
    vi.mocked(isOnHold).mockResolvedValue(null)
    const r = await claimApplicantPurgeSlot(db, { applicationId: "app-1", subjectAuthUserId: null })
    expect(r).toEqual({ ok: false, reason: "subject_missing" })
    expect(isOnHold).not.toHaveBeenCalled()
  })
})

/** tenants-query mock: db.from("tenants").select("auth_user_id").eq("id").maybeSingle() → { data } */
function tenantsDb(authUserId: string | null): Parameters<typeof resolveSubjectAuthUserId>[0] {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) chain[m] = () => chain
  chain.maybeSingle = () => Promise.resolve({ data: authUserId === undefined ? null : { auth_user_id: authUserId }, error: null })
  return { from: () => chain } as unknown as Parameters<typeof resolveSubjectAuthUserId>[0]
}

describe("resolveSubjectAuthUserId — applicant ≡ tenant chain", () => {
  it("returns null for a null tenant_id without querying", async () => {
    expect(await resolveSubjectAuthUserId(tenantsDb("x"), null)).toBeNull()
  })
  it("returns the auth_user_id when the tenant has one", async () => {
    expect(await resolveSubjectAuthUserId(tenantsDb("sub-1"), "t-1")).toBe("sub-1")
  })
  it("returns null when the tenant has no linked user account (→ gate treats as subject_missing)", async () => {
    expect(await resolveSubjectAuthUserId(tenantsDb(null), "t-1")).toBeNull()
  })
})
