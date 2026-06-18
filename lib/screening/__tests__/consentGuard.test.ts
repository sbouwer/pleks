import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { assertScreeningConsent, screeningSubjectFor, ScreeningConsentViolation } from "../consentGuard"

/** Minimal from→select→eq→single mock returning a fixed consent row (or error). */
function makeDb(result: { consent?: string | null; error?: string }): { db: SupabaseClient; table: () => string } {
  let lastTable = ""
  const db = {
    from(table: string) {
      lastTable = table
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve(
              result.error
                ? { data: null, error: { message: result.error } }
                : { data: { stage2_consent_given_at: result.consent ?? null }, error: null },
            ),
          }),
        }),
      }
    },
  } as unknown as SupabaseClient
  return { db, table: () => lastTable }
}

describe("screeningSubjectFor", () => {
  it("maps company → applications and co_applicant → application_co_applicants", () => {
    expect(screeningSubjectFor("company", "app-1")).toEqual({ table: "applications", id: "app-1" })
    expect(screeningSubjectFor("co_applicant", "ca-1")).toEqual({ table: "application_co_applicants", id: "ca-1" })
  })
})

describe("assertScreeningConsent", () => {
  it("passes when stage2_consent_given_at is set", async () => {
    const { db } = makeDb({ consent: "2026-06-18T00:00:00Z" })
    await expect(assertScreeningConsent(db, { table: "applications", id: "app-1" })).resolves.toBeUndefined()
  })

  it("throws ScreeningConsentViolation when consent is null (the gate)", async () => {
    const { db } = makeDb({ consent: null })
    await expect(assertScreeningConsent(db, { table: "applications", id: "app-1" }))
      .rejects.toBeInstanceOf(ScreeningConsentViolation)
  })

  it("fails closed — throws on a consent read error rather than screening blind", async () => {
    const { db } = makeDb({ error: "boom" })
    await expect(assertScreeningConsent(db, { table: "application_co_applicants", id: "ca-1" }))
      .rejects.toBeInstanceOf(ScreeningConsentViolation)
  })

  it("reads from the subject's own table", async () => {
    const { db, table } = makeDb({ consent: "2026-06-18T00:00:00Z" })
    await assertScreeningConsent(db, { table: "application_co_applicants", id: "ca-9" })
    expect(table()).toBe("application_co_applicants")
  })
})
