/**
 * lib/screening/__tests__/completeSubject.test.ts — 14X N3 fires on the transition to complete and nowhere else
 *
 * Notes:  Walker 14x-p4 F5. The guarded update returns the rows it moved: one row → this call completed the subject, so it
 *         audits and offers N3; no rows → already complete (a re-entered settle), so nobody is told twice; an error →
 *         thrown, never read as "already complete". A throwing N3 never undoes the completion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const notifyProgress = vi.fn(async () => undefined)
const recordAudit = vi.fn(async () => undefined)
vi.mock("@/lib/screening/milestoneNotices", () => ({ notifyProgress: (...a: unknown[]) => notifyProgress(...(a as [])) }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...(a as [])) }))
vi.mock("@/lib/supabase/logQueryError", () => ({ logQueryError: () => undefined }))
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined }))

import { completeSubject } from "../completeSubject"

type Calls = Array<{ table: string; m: string; args: unknown[] }>

function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: Calls = []
  const db = {
    from(table: string) {
      const b: Record<string, unknown> = {}
      for (const m of ["update", "eq", "neq"]) {
        b[m] = (...args: unknown[]) => {
          calls.push({ table, m, args })
          return b
        }
      }
      b.select = async () => result
      return b
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

const coLine = { org_id: "org-A", application_id: "app-1", subject_type: "co_applicant" as const, subject_id: "co-1" }
const NOW = "2026-10-05T10:00:00.000Z"

beforeEach(() => { notifyProgress.mockClear(); recordAudit.mockClear() })

describe("completeSubject", () => {
  it("KNOWN-GOOD: the transition (one row moved) audits and offers N3 for the completer", async () => {
    const { db, calls } = fakeDb({ data: [{ id: "co-1" }], error: null })
    expect(await completeSubject(db, coLine, NOW)).toBe(true)
    expect(calls).toContainEqual({ table: "application_co_applicants", m: "neq", args: ["searchworx_check_status", "complete"] })
    expect(calls).toContainEqual({ table: "application_co_applicants", m: "eq", args: ["org_id", "org-A"] })
    expect(recordAudit).toHaveBeenCalledTimes(1)
    expect(notifyProgress).toHaveBeenCalledWith(db, {
      orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" },
    })
  })

  it("PLANTED: a re-entered settle (nothing moved) tells nobody and audits nothing", async () => {
    const { db } = fakeDb({ data: [], error: null })
    expect(await completeSubject(db, coLine, NOW)).toBe(false)
    expect(notifyProgress).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("PLANTED: a write error throws — it is never read as 'already complete'", async () => {
    const { db } = fakeDb({ data: null, error: { message: "boom" } })
    await expect(completeSubject(db, coLine, NOW)).rejects.toThrow(/mark complete failed/)
    expect(notifyProgress).not.toHaveBeenCalled()
  })

  it("the lead's line completes the application row", async () => {
    const { db, calls } = fakeDb({ data: [{ id: "app-1" }], error: null })
    await completeSubject(db, { ...coLine, subject_type: "applicant", subject_id: "app-1" }, NOW)
    expect(calls).toContainEqual({ table: "applications", m: "eq", args: ["id", "app-1"] })
    expect(notifyProgress).toHaveBeenCalledTimes(1)
  })

  it("an N3 that throws does not undo the completion", async () => {
    notifyProgress.mockRejectedValueOnce(new Error("roster read failed"))
    const { db } = fakeDb({ data: [{ id: "co-1" }], error: null })
    expect(await completeSubject(db, coLine, NOW)).toBe(true)
  })
})
