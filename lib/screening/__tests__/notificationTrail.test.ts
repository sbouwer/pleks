/**
 * lib/screening/__tests__/notificationTrail.test.ts — recordTrail never stamps a row with an org it did not verify
 *
 * Notes:  P1 walker F5, probed here at last (P2 walker 14x F6): org_id comes from the application read under the
 *         caller's org, and a row for an application outside that org is REFUSED, never written. Both directions: the
 *         cross-org case must throw with no insert, and the same-org twin must insert exactly the verified org.
 */
import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordTrail } from "../notificationTrail"

/** A stand-in that holds one application in one org and records every insert. */
function fakeDb(appOrg: string) {
  const inserts: Record<string, unknown>[] = []
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (col: string, v: unknown) => { filters[col] = v; return b }
      b.maybeSingle = async () => ({
        data: table === "applications" && filters.id === "app-1" && filters.org_id === appOrg ? { org_id: appOrg } : null,
        error: null,
      })
      b.insert = async (row: Record<string, unknown>) => { inserts.push(row); return { error: null } }
      return b
    },
  }
  return { db: db as unknown as SupabaseClient, inserts }
}

const row = (orgId: string) => ({
  orgId, applicationId: "app-1", subject: { subjectType: "applicant" as const, subjectId: "app-1" },
  milestone: "N2" as const, templateKey: "application.shortlisted", deadlineAsStated: "2026-10-15",
  sent: { success: true, logId: "" },
})

describe("recordTrail", () => {
  it("PLANTED: an application outside the caller's org is refused, and nothing is written", async () => {
    const { db, inserts } = fakeDb("org-B")
    await expect(recordTrail(db, row("org-A"))).rejects.toThrow(/not in org org-A/)
    expect(inserts).toEqual([])
  })

  it("KNOWN-GOOD: same org → one row, stamped with the VERIFIED org; an empty logId is stored as null", async () => {
    const { db, inserts } = fakeDb("org-A")
    await recordTrail(db, row("org-A"))
    expect(inserts).toEqual([expect.objectContaining({
      org_id: "org-A", application_id: "app-1", subject_type: "applicant", subject_id: "app-1", milestone: "N2",
      template_version: 1, channel: "email", send_ok: true, communication_log_id: null, deadline_as_stated: "2026-10-15",
    })])
  })

  it("a null send result is recorded as a failed attempt", async () => {
    const { db, inserts } = fakeDb("org-A")
    await recordTrail(db, { ...row("org-A"), sent: null })
    expect(inserts[0]).toMatchObject({ send_ok: false, communication_log_id: null })
  })
})
