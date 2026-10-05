/**
 * lib/screening/__tests__/resultLink.test.ts — the N6 result link: signed stateless token, open-time re-checks, a trail row per open
 *
 * Notes:  Stéan 2026-10-05, probed both directions. The token is the credential and carries no expiry: a tampered,
 *         foreign-purpose or unsigned token is `invalid`; a genuine one is `gone` once the application is deleted,
 *         purged or purge-eligible, the subject is not among the parties scored, or the subject's own consent did not
 *         record the group block. The org comes from the row. Every successful open writes an audit NOTE, and an open
 *         that cannot be recorded shows nothing. The view never carries a per-party field.
 */
import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/screening/milestoneNotices", () => ({
  readRoster: async (_db: unknown, orgId: string) => orgId !== "org-A" ? null : {
    propertyLabel: "4, Oak Court",
    parties: [
      { subject: { subjectType: "applicant", subjectId: "app-1" }, name: "Lead Party", firstName: "Lead", complete: true },
      { subject: { subjectType: "co_applicant", subjectId: "co-1" }, name: "Co One", firstName: "Co", complete: true },
      { subject: { subjectType: "co_applicant", subjectId: "co-2" }, name: "Co Two", firstName: "Two", complete: false },
    ],
  },
}))

import { RESULT_LINK_MAX_AGE_DAYS, signResultToken, verifyResultToken } from "../resultLink"
import { loadResultView } from "../resultView"
import { ASSESSMENT_CLOSING_SENTENCE } from "../assessmentWording"

type Row = Record<string, unknown>
const NOW = new Date("2026-10-05T12:00:00Z")
const LEAD = { subjectType: "applicant", subjectId: "app-1" } as const
const CO = { subjectType: "co_applicant", subjectId: "co-1" } as const

function fakeDb(over: { app?: Row | null; leadConsent?: Row | null; coConsent?: Row | null; auditFails?: boolean } = {}) {
  const audits: Row[] = []
  const reads: Array<{ table: string; filters: Row }> = []
  const app = over.app === null ? null : {
    id: "app-1", org_id: "org-A", deleted_at: null, stage1_status: "shortlisted", stage2_status: "screening",
    tenant_id: null, reviewed_at: null, prescreened_at: null, updated_at: "2026-10-01T00:00:00Z", pii_purged_at: null,
    fitscore: 712, fitscore_band: "stable_profile", stage2_consent_log_id: "cl-lead",
    fitscore_narrative: { affordabilityEvidenceLine: "SECRET-AFFORDABILITY 25% of joint income", observedConcerns: ["SECRET-CONCERN"] },
    fitscore_component_snapshot: { applicants: [{ id: "co-1", secret: "SECRET-PARTY" }], assessedWith: { n: 2, m: 3, completedSubjectIds: ["app-1", "co-1"] } },
    fitscore_material_flags: ["SECRET-FLAG"],
    ...over.app,
  }
  const consents: Record<string, Row | null | undefined> = {
    "cl-lead": over.leadConsent === undefined ? { group_clause_shown: true, application_id: "app-1" } : over.leadConsent,
    "cl-co": over.coConsent === undefined ? { group_clause_shown: true, application_id: "app-1" } : over.coConsent,
  }
  const db = {
    from(table: string) {
      const filters: Row = {}
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => { filters[c] = v; return b }
      b.maybeSingle = async () => {
        reads.push({ table, filters })
        if (table === "applications") {
          const match = app && filters.id === app.id && (filters.org_id === undefined || filters.org_id === app.org_id)
          return { data: match ? app : null, error: null }
        }
        if (table === "application_co_applicants") {
          const ok = filters.id === "co-1" && filters.primary_application_id === "app-1" && filters.org_id === "org-A"
          return { data: ok ? { stage2_consent_log_id: "cl-co" } : null, error: null }
        }
        if (table === "consent_log") {
          const c = filters.org_id === "org-A" ? consents[filters.id as string] : null
          return { data: c ? { metadata: c } : null, error: null }
        }
        return { data: null, error: null }
      }
      b.insert = (row: Row) => ({
        select: () => ({
          single: async () => {
            if (over.auditFails) return { data: null, error: { message: "insert failed" } }
            audits.push(row)
            return { data: { id: `audit-${audits.length}` }, error: null }
          },
        }),
      })
      return b
    },
  }
  return { db: db as unknown as SupabaseClient, audits, reads }
}

beforeEach(() => { process.env.CONSENT_HMAC_SECRET = "test-secret" })

describe("the token", () => {
  it("round-trips the application and the subject", () => {
    expect(verifyResultToken(signResultToken("app-1", CO))).toEqual({ applicationId: "app-1", subject: CO })
  })

  it("PLANTED: a tampered body, a re-pointed subject, a foreign purpose, or no secret is rejected", () => {
    const token = signResultToken("app-1", CO) as string
    const [body, sig] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ v: 1, p: "result", app: "app-1", st: "co_applicant", sid: "co-2" })).toString("base64url")
    expect(verifyResultToken(`${forged}.${sig}`)).toBeNull()
    expect(verifyResultToken(`${body}.${sig.slice(0, -2)}xx`)).toBeNull()
    // Signed with the right key but WITHOUT the "result:" domain prefix — e.g. a digest minted for another purpose.
    const unprefixed = createHmac("sha256", "test-secret").update(body).digest("base64url")
    expect(verifyResultToken(`${body}.${unprefixed}`)).toBeNull()
    const otherPurpose = Buffer.from(JSON.stringify({ v: 1, p: "consent", app: "app-1", st: "co_applicant", sid: "co-1" })).toString("base64url")
    const otherSig = createHmac("sha256", "test-secret").update(`result:${otherPurpose}`).digest("base64url")
    expect(verifyResultToken(`${otherPurpose}.${otherSig}`)).toBeNull()
    const noAge = Buffer.from(JSON.stringify({ v: 1, p: "result", app: "app-1", st: "co_applicant", sid: "co-1" })).toString("base64url")
    const noAgeSig = createHmac("sha256", "test-secret").update(`result:${noAge}`).digest("base64url")
    expect(verifyResultToken(`${noAge}.${noAgeSig}`)).toBeNull()
    delete process.env.CONSENT_HMAC_SECRET
    expect(signResultToken("app-1", CO)).toBeNull()
    expect(verifyResultToken(token)).toBeNull()
  })
})

describe("the cap from mint (F2: an approved or undecided application has no purge date)", () => {
  const DAY = 86_400_000
  it("PLANTED: a link minted more than RESULT_LINK_MAX_AGE_DAYS ago is dead, even on an approved application", async () => {
    const { db, audits } = fakeDb({ app: { stage2_status: "approved", tenant_id: "t-1" } })
    const old = signResultToken("app-1", CO, new Date(NOW.getTime() - (RESULT_LINK_MAX_AGE_DAYS + 1) * DAY)) as string
    expect((await loadResultView(db, old, NOW)).status).toBe("invalid")
    expect(audits).toHaveLength(0)
  })

  it("known-good twin: one day inside the cap still opens", async () => {
    const { db } = fakeDb({ app: { stage2_status: "approved", tenant_id: "t-1" } })
    const recent = signResultToken("app-1", CO, new Date(NOW.getTime() - (RESULT_LINK_MAX_AGE_DAYS - 1) * DAY)) as string
    expect((await loadResultView(db, recent, NOW)).status).toBe("ok")
  })

  it("PLANTED: a token minted in the future is rejected", () => {
    expect(verifyResultToken(signResultToken("app-1", CO, new Date(NOW.getTime() + DAY)), NOW)).toBeNull()
  })
})

describe("an open (loadResultView)", () => {
  it("shows the consolidated assessment only, and records the open", async () => {
    const { db, audits } = fakeDb()
    const out = await loadResultView(db, signResultToken("app-1", CO, NOW) as string, NOW, { ipAddress: null, userAgent: "ua" })
    expect(out.status).toBe("ok")
    if (out.status !== "ok") return
    expect(out.view).toMatchObject({
      firstName: "Co", score: 712, bandLabel: "Stable Profile",
      completedNames: ["Lead Party", "Co One"], completed: 2, total: 3, closingSentence: ASSESSMENT_CLOSING_SENTENCE,
    })
    const flat = JSON.stringify(out.view)
    // The affordability line too: its joint ratios give up the other party's income and debt by subtraction (F1).
    for (const secret of ["SECRET-AFFORDABILITY", "SECRET-CONCERN", "SECRET-PARTY", "SECRET-FLAG", "Co Two"]) {
      expect(flat).not.toContain(secret)
    }
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ org_id: "org-A", action: "NOTE", table_name: "applications", record_id: "app-1" })
    expect(audits[0].new_values).toMatchObject({ action: "screening_result_opened", subject_type: "co_applicant", subject_id: "co-1" })
  })

  it("the org is the row's: every later read is bound to it, none to anything the request supplied", async () => {
    const { db, reads } = fakeDb()
    await loadResultView(db, signResultToken("app-1", LEAD, NOW) as string, NOW)
    for (const r of reads.slice(1)) expect(r.filters.org_id).toBe("org-A")
  })

  it("PLANTED: a forged token is invalid and records nothing", async () => {
    const { db, audits } = fakeDb()
    expect((await loadResultView(db, "nope.nope", NOW)).status).toBe("invalid")
    expect(audits).toHaveLength(0)
  })

  const goneCases: Array<[string, Parameters<typeof fakeDb>[0], typeof LEAD | typeof CO]> = [
    ["the application no longer exists", { app: null }, CO],
    ["the application is deleted", { app: { deleted_at: "2026-10-02T00:00:00Z" } }, CO],
    ["the application is already purged", { app: { pii_purged_at: "2026-10-02T00:00:00Z" } }, CO],
    ["the application is purge-eligible today (declined 90+ days ago)",
      { app: { stage2_status: "declined", reviewed_at: "2026-06-01T00:00:00Z" } }, CO],
    ["the subject is not among the parties scored", { app: { fitscore_component_snapshot: { assessedWith: { n: 1, m: 2, completedSubjectIds: ["app-1"] } } } }, CO],
    ["the snapshot carries no stamp", { app: { fitscore_component_snapshot: {} } }, CO],
    ["the subject's consent did not record the group block", { coConsent: { group_clause_shown: false, application_id: "app-1" } }, CO],
    ["the subject's consent carries no flag (given before P5)", { coConsent: { application_id: "app-1" } }, CO],
    ["the lead's consent did not record the group block", { leadConsent: { group_clause_shown: false, application_id: "app-1" } }, LEAD],
  ]
  for (const [name, over, subject] of goneCases) {
    it(`PLANTED: gone when ${name} — and nothing is recorded`, async () => {
      const { db, audits } = fakeDb(over)
      expect((await loadResultView(db, signResultToken("app-1", subject, NOW) as string, NOW)).status).toBe("gone")
      expect(audits).toHaveLength(0)
    })
  }

  it("known-good twin: declined 89 days ago is still open", async () => {
    const { db } = fakeDb({ app: { stage2_status: "declined", reviewed_at: new Date(NOW.getTime() - 89 * 86_400_000).toISOString() } })
    expect((await loadResultView(db, signResultToken("app-1", CO, NOW) as string, NOW)).status).toBe("ok")
  })

  it("PLANTED: an open that cannot be recorded shows nothing", async () => {
    const { db } = fakeDb({ auditFails: true })
    await expect(loadResultView(db, signResultToken("app-1", CO, NOW) as string, NOW)).rejects.toThrow(/could not be recorded/)
  })
})
