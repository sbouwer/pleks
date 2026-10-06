/**
 * lib/screening/__tests__/screeningConsent.test.tsx — 14X P5: the group block is shown and recorded as one, and only truly
 *
 * Notes:  Probed both directions. RECORDED: `group_clause_shown` is true only when the form showed the block AND the
 *         application has a live co party when the consent is written; a client claim on a single-party application,
 *         or a block not shown, records false (withholds the N6 link — fails closed). An unreadable party count records
 *         nothing at all. RENDERED: the group block and the group checkbox appear together or not at all, in the
 *         approved words from lib/screening/consentWording.ts.
 *         CONSENT v2 (counsel 2026-10-03): the text consents to checks the bundle runs and to nothing else (no TPN, no
 *         sequestrations, no blacklisting), carries counsel's withdrawal sentence, and the record says v2 and logs no
 *         check the text does not name.
 */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SCREENING_CONSENT_VERSION, insertScreeningConsentLog, isGroupApplication } from "../screeningConsent"
import {
  CONSENT_CHECKBOX_GROUP, CONSENT_CHECKBOX_SINGLE, GROUP_COMPLETION_STATUS_SENTENCE, GROUP_CONSOLIDATION_PARAGRAPH,
} from "../consentWording"
import { ScreeningConsentForm } from "@/components/consent/ScreeningConsentForm"

type Row = Record<string, unknown>

/** co rows for app-1 in org-A; `countFails` makes the party count error. Records every consent_log insert. */
function fakeDb(liveCos: number, countFails = false) {
  const inserts: Row[] = []
  const countFilters: Record<string, unknown> = {}
  const db = {
    from(table: string) {
      const b: Record<string, unknown> = {}
      if (table === "application_co_applicants") {
        b.select = () => b
        b.eq = (c: string, v: unknown) => { countFilters[c] = v; return b }
        b.is = (c: string, v: unknown) => {
          countFilters[`is:${c}`] = v
          const mine = countFilters.org_id === "org-A" && countFilters.primary_application_id === "app-1"
          return Promise.resolve(countFails
            ? { count: null, error: { message: "boom" } }
            : { count: mine ? liveCos : 0, error: null })
        }
        return b
      }
      b.insert = (row: Row) => {
        inserts.push(row)
        return { select: () => ({ single: async () => ({ data: { id: "log-1" }, error: null }) }) }
      }
      return b
    },
  }
  return { db: db as unknown as SupabaseClient, inserts, countFilters }
}

const input = (groupClauseShown: boolean) => ({
  orgId: "org-A", subjectEmail: "a@example.test", applicationId: "app-1", ip: null, userAgent: null,
  verificationId: null, groupClauseShown,
})
const flag = (r: Row) => (r.metadata as Row).group_clause_shown

describe("group_clause_shown — recorded only when shown AND the application is a group one", () => {
  it("shown on a group application → true", async () => {
    const { db, inserts } = fakeDb(1)
    expect(await insertScreeningConsentLog(db, input(true))).toEqual({ ok: true, id: "log-1" })
    expect(flag(inserts[0])).toBe(true)
  })

  it("PLANTED: the client claims it was shown on a single-party application → false", async () => {
    const { db, inserts } = fakeDb(0)
    await insertScreeningConsentLog(db, input(true))
    expect(flag(inserts[0])).toBe(false)
  })

  it("not shown on a group application → false (the party did not see it)", async () => {
    const { db, inserts } = fakeDb(2)
    await insertScreeningConsentLog(db, input(false))
    expect(flag(inserts[0])).toBe(false)
  })

  it("an unreadable party count records no consent at all, rather than a guess", async () => {
    const { db, inserts } = fakeDb(1, true)
    expect(await insertScreeningConsentLog(db, input(true))).toEqual({ ok: false, error: expect.stringContaining("boom") })
    expect(inserts).toEqual([])
  })

  it("the count is scoped to the org and the application, and leaves declined parties out", async () => {
    const { db, countFilters } = fakeDb(1)
    expect(await isGroupApplication(db, "org-A", "app-1")).toBe(true)
    expect(countFilters).toEqual({ primary_application_id: "app-1", org_id: "org-A", "is:declined_at": null })
    expect(await isGroupApplication(fakeDb(1).db, "org-B", "app-1")).toBe(false)
  })
})

describe("the consent form renders the group block as one", () => {
  const render = (groupClause: boolean) => renderToStaticMarkup(
    <ScreeningConsentForm token="t" consentType="standard_bundle" recordUrl="/r" onRecorded={() => undefined} groupClause={groupClause} />,
  )
  const unescape = (h: string) => h.replaceAll("&#x27;", "'").replaceAll("&#39;", "'")

  it("group: both sentences and the group checkbox, verbatim", () => {
    const html = unescape(render(true))
    expect(html).toContain(GROUP_CONSOLIDATION_PARAGRAPH)
    expect(html).toContain(GROUP_COMPLETION_STATUS_SENTENCE)
    expect(html).toContain(CONSENT_CHECKBOX_GROUP)
  })

  it("single party: neither sentence, and the short checkbox", () => {
    const html = unescape(render(false))
    expect(html).not.toContain(GROUP_CONSOLIDATION_PARAGRAPH)
    expect(html).not.toContain(GROUP_COMPLETION_STATUS_SENTENCE)
    expect(html).not.toContain(CONSENT_CHECKBOX_GROUP)
    expect(html).toContain(CONSENT_CHECKBOX_SINGLE)
  })
})

describe("consent v2 — the text names only what runs, and the record says so", () => {
  const html = renderToStaticMarkup(
    <ScreeningConsentForm token="t" consentType="standard_bundle" recordUrl="/r" onRecorded={() => undefined} groupClause={false} />,
  ).replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll(/<!-- -->/g, "").replaceAll(/\s+/g, " ")

  it("consents TO the checks, with counsel's withdrawal sentence", () => {
    expect(html).toContain("you consent to Pleks and its screening partner")
    expect(html).toContain(
      "You may withdraw your consent at any time. If you withdraw consent before screening is completed, your application cannot proceed through the screening process.",
    )
  })

  it("PLANTED: no check the bundle never runs, and not the v1 wording", () => {
    for (const gone of ["TPN", "blacklist", "sequestration", "you authorise", "will result in your application being withdrawn"]) {
      expect(html.toLowerCase()).not.toContain(gone.toLowerCase())
    }
  })

  it("PLANTED: the invite page's fee line names no rental-history check either", async () => {
    const { readFile } = await import("node:fs/promises")
    const page = await readFile("app/(applicant)/apply/invite/[token]/page.tsx", "utf8")
    // The rendered fee sentence, not the comment beside it: read the <p> that states what the fee covers.
    const start = page.indexOf("This fee covers")
    const fee = page.slice(start, page.indexOf("</p>", start))
    expect(fee).toContain("credit checks")
    expect(fee.toLowerCase()).not.toMatch(/rental\s+history|tpn/)
  })

  it("the record is v2 and logs no TPN check", async () => {
    const { db, inserts } = fakeDb(0)
    await insertScreeningConsentLog(db, input(false))
    expect(SCREENING_CONSENT_VERSION).toBe("2.0-searchworx-stage2")
    expect(inserts[0].consent_version).toBe(SCREENING_CONSENT_VERSION)
    expect((inserts[0].metadata as Row).check_types).not.toContain("tpn_adverse")
  })
})
