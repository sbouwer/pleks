/**
 * lib/screening/__tests__/milestoneNotices.test.ts — 14X N3/N5/N6/N6′: held copy records a gap; released copy is counsel's
 *
 * Notes:  ADDENDUM_14X §4/§5, probed both directions. HELD (N3 and the lead's chaser N5, until counsel's rows read ready):
 *         no email leaves, and the trail gets ONE gap row per party per milestone however many runs see it due.
 *         RELEASED (N5/N6/N6′ since counsel 2026-10-05; N3 simulated): the email is sent and trailed. N3 counts the
 *         others and never names who is outstanding (counsel Q1); the completer is never told about themselves; a
 *         declined or lapsed party is neither told nor counted. N6′ never carries a link (§5) and names nobody; N6 names
 *         only the completed and closes on the one approved sentence. Every applicant-typed name is escaped.
 *         N6 SENDING (notifyOutcome): once per recipient however often the orchestrator re-runs, only to the parties the
 *         stamp names, nothing for a stampless or foreign row; the result link only to a recipient whose own consent
 *         recorded the group block (counsel row 3a, per recipient), and a link that cannot be decided never stops N6.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const sent: Array<Record<string, unknown>> = []
let released = false
vi.mock("@/lib/comms/send-email", () => ({
  sendEmail: async (p: Record<string, unknown>) => { sent.push(p); return { success: true, logId: "log-1" } },
}))
vi.mock("@/lib/comms/template-registry", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/comms/template-registry")>()
  return { ...real, heldFor: (key: string) => (released ? null : real.heldFor(key)) }
})
vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined, captureMessage: () => undefined }))

import {
  FINAL_NOTICE_KEY, FINAL_NOTICE_OTHERS_KEY, OUTCOME_ABSENT_KEY, OUTCOME_KEY, PROGRESS_KEY, finalNoticeCopy,
  finalNoticeOthersCopy, leadFinalNoticeForOthers, notifyOutcome, notifyProgress, outcomeAbsentCopy, outcomeCopy,
  progressCopy, sendMilestoneNotice,
} from "../milestoneNotices"
import { heldFor } from "@/lib/comms/template-registry"
import { ASSESSMENT_CLOSING_SENTENCE } from "../assessmentWording"

type Row = Record<string, unknown>
/** consent_log rows by id: their metadata, or "boom" for a read that fails. */
const consents: Record<string, Row | "boom"> = {}
const DAY_MS = 86_400_000
// Relative to the clock, never a fixed date: the roster drops a party past its own D, so a fixed fixture would turn
// every N3 test into a lapsed-party test the day its D passed (walker 14x-p4 N1).
const INVITED = new Date(Date.now() - 2 * DAY_MS).toISOString()
const LAPSED = new Date(Date.now() - 15 * DAY_MS).toISOString()

/** One application in org-A, its co rows, its lines' paid state, and the trail table (reads return what was inserted). */
function fakeDb(lead: Partial<Row> = {}, cos: Row[] = [], paid: string[] = []) {
  const trail: Row[] = []
  const coFilters: Record<string, unknown> = {}
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => {
        filters[c] = v
        if (table === "application_co_applicants") coFilters[c] = v
        return b
      }
      b.is = (c: string, v: unknown) => {
        if (table === "application_co_applicants") coFilters[`is:${c}`] = v
        return b
      }
      b.order = async () => ({ data: cos.filter((c) => !c.declined_at), error: null })
      b.limit = async () => ({
        data: trail.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v)).map((r) => ({ id: r.milestone })),
        error: null,
      })
      b.maybeSingle = async () => {
        if (table === "consent_log") {
          const c = filters.org_id === "org-A" ? consents[filters.id as string] : undefined
          if (c === "boom") return { data: null, error: { message: "read failed" } }
          return { data: c ? { metadata: c } : null, error: null }
        }
        if (table !== "applications" || filters.org_id !== "org-A") return { data: null, error: null }
        return { data: {
          id: "app-1", org_id: "org-A", entity_type: "individual", first_name: "Lead", last_name: "Party",
          applicant_email: "lead@example.test", stage2_invited_at: INVITED, searchworx_check_status: "pending",
          listings: { units: { unit_number: "4", properties: { name: "Oak Court" } } }, ...lead,
        }, error: null }
      }
      b.insert = async (row: Row) => { trail.push(row); return { error: null } }
      if (table === "screening_notification_events") {
        b.then = (resolve: (v: unknown) => void) => resolve({
          data: trail.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v)).map((r) => ({ milestone: r.milestone })),
          error: null,
        })
      }
      if (table === "v_application_screening_lines") {
        b.then = (resolve: (v: unknown) => void) => resolve({
          data: filters.org_id === "org-A" ? paid.map((key) => {
            // "type:id" is paid, consent still owed; "type:id:state" carries the view's state (e.g. running).
            const [subject_type, subject_id, state = "paid_pending_consent"] = key.split(":")
            return { subject_type, subject_id, paid_at: "2026-10-01T00:00:00Z", state }
          }) : [],
          error: null,
        })
      }
      return b
    },
  }
  return { db: db as unknown as SupabaseClient, trail, coFilters }
}

const co = (id: string, over: Row = {}): Row => ({
  id, first_name: id.toUpperCase(), last_name: "Co", applicant_email: `${id}@example.test`, stage2_invited_at: INVITED,
  searchworx_check_status: "pending", declined_at: null, ...over,
})

const n3 = (db: SupabaseClient) => sendMilestoneNotice(db, {
  orgId: "org-A", applicationId: "app-1", subject: { subjectType: "co_applicant", subjectId: "co-1" }, milestone: "N3",
  templateKey: PROGRESS_KEY, deadlineAsStated: "2026-10-15", to: { email: "co-1@example.test", name: "C" },
  copy: { subject: "s", html: "h" }, triggerEventType: "test",
})

beforeEach(() => {
  sent.length = 0; released = false
  for (const k of Object.keys(consents)) delete consents[k]
  process.env.CONSENT_HMAC_SECRET = "test-secret"
})

describe("counsel 2026-10-05: what is held and what is released", () => {
  it("N3 and the lead's chaser N5 are held; N5, N6 and N6′ are released", () => {
    expect(heldFor(PROGRESS_KEY)).toMatch(/COUNSEL_DRAFT_14X/)
    expect(heldFor(FINAL_NOTICE_OTHERS_KEY)).toMatch(/COUNSEL_DRAFT_14X/)
    for (const key of [FINAL_NOTICE_KEY, OUTCOME_KEY, OUTCOME_ABSENT_KEY]) expect(heldFor(key)).toBeNull()
  })

  it("PLANTED: a held milestone sends nothing and records ONE gap row, however many runs see it due", async () => {
    const { db, trail } = fakeDb()
    expect(await n3(db)).toEqual({ outcome: "held" })
    expect(await n3(db)).toEqual({ outcome: "held" })
    expect(sent).toEqual([])
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({
      milestone: "N3", template_key: PROGRESS_KEY, send_ok: false, communication_log_id: null, deadline_as_stated: "2026-10-15",
    })
  })

  it("KNOWN-GOOD: released, the notice is sent and its attempt trailed with the delivery row", async () => {
    released = true
    const { db, trail } = fakeDb()
    expect(await n3(db)).toEqual({ outcome: "sent" })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ templateKey: PROGRESS_KEY, entityType: "application_co_applicant", entityId: "co-1" })
    expect(trail).toEqual([expect.objectContaining({ milestone: "N3", send_ok: true, communication_log_id: "log-1" })])
  })
})

describe("N3 — on a completion", () => {
  beforeEach(() => { released = true })
  const recipients = () => sent.map((s) => (s.to as { email: string }).email).sort()

  it("tells every other outstanding invited party and the lead; never the completer, never a declined party", async () => {
    const { db, coFilters } = fakeDb({}, [co("co-1"), co("co-2"), co("co-3", { declined_at: "2026-10-05T00:00:00Z" })])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(coFilters).toMatchObject({ primary_application_id: "app-1", org_id: "org-A", "is:declined_at": null })
    expect(recipients()).toEqual(["co-2@example.test", "lead@example.test"])
    for (const s of sent) {
      expect(s.contentHtml).toContain("CO-1 Co has completed their part")
      expect(s.contentHtml).toContain("1 of 3 parties have now completed.")
      expect(s.contentHtml).not.toContain("CO-3")
    }
  })

  it("PLANTED (counsel Q1): N3 never names a party who has not completed — it counts them", async () => {
    const { db } = fakeDb({}, [co("co-1"), co("co-2")])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(sent.length).toBeGreaterThan(0)
    for (const s of sent) {
      // The greeting is the recipient's own name; everything after it may name only the completer.
      const body = String(s.contentHtml).replace(/^\s*<p>Hi [^<]*<\/p>/, "")
      expect(body).not.toMatch(/CO-2|Lead|waiting on/i)
      expect(body).not.toMatch(/failed|refused|not consented|not paid/i)
    }
  })

  it("an already-complete co party is counted and told nothing; the lead is still told", async () => {
    const { db } = fakeDb({}, [co("co-1"), co("co-2", { searchworx_check_status: "complete" })])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["lead@example.test"])
    expect(sent[0].contentHtml).toContain("2 of 3 parties have now completed.")
  })

  it("an uninvited co party is outstanding but not told (it has no link to act on)", async () => {
    const { db } = fakeDb({ searchworx_check_status: "complete" }, [co("co-1"), co("co-2", { stage2_invited_at: null })])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["lead@example.test"])
    expect(sent[0].contentHtml).toContain("2 of 3 parties have now completed.")
  })

  it("PLANTED (walker 14x-p4 F3): a party past its own D, unpaid and not yet declined, is neither counted nor told", async () => {
    const { db } = fakeDb({ stage2_invited_at: LAPSED }, [co("co-1"), co("co-2", { stage2_invited_at: LAPSED }), co("co-3")])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["co-3@example.test"])
    expect(sent[0].contentHtml).toContain("1 of 2 parties have now completed.")
  })

  it("KNOWN-GOOD twin: a COMPLETE lead invited long ago is still told — only an incomplete party lapses", async () => {
    const { db } = fakeDb({ stage2_invited_at: LAPSED, searchworx_check_status: "complete" }, [co("co-1"), co("co-2")])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["co-2@example.test", "lead@example.test"])
  })

  it("PLANTED (walker 14x-p4 N2): a PAID lead whose check is still running past its D is still told and still waited on", async () => {
    const { db } = fakeDb(
      { stage2_invited_at: LAPSED, searchworx_check_status: "running" }, [co("co-1", { stage2_invited_at: LAPSED })],
      ["applicant:app-1", "co_applicant:co-1"],
    )
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["lead@example.test"])
    expect(sent[0].contentHtml).toContain("1 of 2 parties have now completed.")
  })

  it("twin: the same lead past its D UNPAID has lapsed — only the co party paid", async () => {
    const { db } = fakeDb({ stage2_invited_at: LAPSED }, [co("co-1"), co("co-2")], ["co_applicant:co-1"])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["co-2@example.test"])
  })

  it("the lead completing tells the outstanding co parties", async () => {
    const { db } = fakeDb({ searchworx_check_status: "complete" }, [co("co-1")])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "applicant", subjectId: "app-1" } })
    expect(recipients()).toEqual(["co-1@example.test"])
    expect(sent[0].contentHtml).toContain("Lead Party has completed their part")
  })

  it("nobody outstanding → nothing (N6 covers it)", async () => {
    const { db, trail } = fakeDb({ searchworx_check_status: "complete" }, [co("co-1", { searchworx_check_status: "complete" })])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(sent).toEqual([])
    expect(trail).toEqual([])
  })

  it("an application outside the caller's org is told nothing", async () => {
    const { db } = fakeDb({}, [co("co-1"), co("co-2")])
    await notifyProgress(db, { orgId: "org-B", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(sent).toEqual([])
  })
})

describe("copy", () => {
  it("escapes applicant-typed names", () => {
    const { html } = progressCopy({ firstName: "<b>", completedName: "A & B", completed: 1, total: 2, propertyLabel: "<script>x</script>" })
    expect(html).not.toContain("<script>")
    expect(html).toContain("A &amp; B")
    expect(html).toContain("&lt;b&gt;")
    const n6 = outcomeCopy({ firstName: "F", propertyLabel: "P", completedNames: ["<i>x</i>"], completed: 1, total: 2, link: null })
    expect(n6.html).not.toContain("<i>")
  })

  it("N5 carries counsel's sentences verbatim: the co party's formulation and the lead variant left unchanged", () => {
    expect(finalNoticeCopy({ firstName: "C", deadline: "15 October 2026", propertyLabel: "P", lead: false }).html).toContain(
      "If you do not complete your part by 15 October 2026, the application will be assessed without your screening information.")
    expect(finalNoticeCopy({ firstName: "L", deadline: "15 October 2026", propertyLabel: "P", lead: true }).html).toContain(
      "If your part is not complete by then, the application cannot be assessed.")
  })

  it("N6 names only the completed, states the count, and closes on THE approved sentence; the link only when given", () => {
    const base = { firstName: "F", propertyLabel: "P", completedNames: ["Ann A", "Bo B"], completed: 2, total: 3 }
    const off = outcomeCopy({ ...base, link: null }).html
    expect(off).toContain("based on the parts that were completed:\nAnn A and Bo B.")
    expect(off).toContain("Assessed with 2 of 3 parties.")
    expect(off).toContain(ASSESSMENT_CLOSING_SENTENCE.replace("'", "&#39;"))
    expect(off).not.toMatch(/href/)
    expect(outcomeCopy({ ...base, link: "https://app.test/r/x" }).html).toContain('href="https://app.test/r/x"')
  })

  it("the lead's chaser N5 names nobody and states no date", () => {
    const { html } = finalNoticeOthersCopy({ firstName: "L", propertyLabel: "P", completed: 2, total: 3 })
    expect(html).toContain("2 of 3 parties have completed so far.")
    expect(html).not.toMatch(/\d{1,2} [A-Z][a-z]+ \d{4}/)
  })

  it("N6′ never carries a link and names nobody but the recipient", () => {
    for (const lead of [false, true]) {
      const { html } = outcomeAbsentCopy({ firstName: "Sam", propertyLabel: "4, Oak Court", lead })
      expect(html).not.toMatch(/href|https?:/i)
      expect(html).not.toMatch(/completed|waiting on/i)
    }
  })

  it("the lead's variants never promise an assessment without the lead", () => {
    expect(finalNoticeCopy({ firstName: "L", deadline: "15 October 2026", propertyLabel: "P", lead: true }).html)
      .not.toMatch(/assessed without you/)
    expect(outcomeAbsentCopy({ firstName: "L", propertyLabel: "P", lead: true }).html).not.toMatch(/assessed without you/)
    expect(finalNoticeCopy({ firstName: "C", deadline: "15 October 2026", propertyLabel: "P", lead: false }).html)
      .toMatch(/assessed without your screening information/)
  })
})

describe("N5 to a lead whose own part is complete (14X §2) — held new copy", () => {
  const NOW = new Date()
  const finalDay = new Date(NOW.getTime() - 13.5 * DAY_MS).toISOString()

  it("due while another party is in its final 24 hours: held, the gap recorded once as the lead's N5", async () => {
    const { db, trail } = fakeDb({ searchworx_check_status: "complete", stage2_invited_at: finalDay }, [co("co-1", { stage2_invited_at: finalDay })])
    expect(await leadFinalNoticeForOthers(db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toEqual({ outcome: "held" })
    expect(sent).toEqual([])
    expect(trail).toEqual([expect.objectContaining({ milestone: "N5", template_key: FINAL_NOTICE_OTHERS_KEY, subject_type: "applicant" })])
  })

  it("released (simulated): the lead is sent the count, no names", async () => {
    released = true
    const { db } = fakeDb({ searchworx_check_status: "complete", stage2_invited_at: finalDay }, [co("co-1", { stage2_invited_at: finalDay })])
    expect(await leadFinalNoticeForOthers(db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toEqual({ outcome: "sent" })
    expect(sent[0]).toMatchObject({ templateKey: FINAL_NOTICE_OTHERS_KEY, to: { email: "lead@example.test", name: "Lead" } })
    expect(sent[0].contentHtml).toContain("1 of 2 parties have completed so far.")
    expect(sent[0].contentHtml).not.toContain("CO-1")
  })

  it("paid-and-running counts as done (Stéan 2026-10-05, §0): a running lead is due; a running co party is not outstanding", async () => {
    const runningLead = fakeDb({ stage2_invited_at: finalDay }, [co("co-1", { stage2_invited_at: finalDay })], ["applicant:app-1:running"])
    expect(await leadFinalNoticeForOthers(runningLead.db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toEqual({ outcome: "held" })
    const runningCo = fakeDb({ searchworx_check_status: "complete", stage2_invited_at: finalDay },
      [co("co-1", { stage2_invited_at: finalDay })], ["co_applicant:co-1:running"])
    expect(await leadFinalNoticeForOthers(runningCo.db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toBeNull()
  })

  it("PLANTED: paid but consent still owed is NOT done — the co party is still outstanding, and counted as such", async () => {
    released = true
    const { db } = fakeDb({ searchworx_check_status: "complete", stage2_invited_at: finalDay },
      [co("co-1", { stage2_invited_at: finalDay }), co("co-2", { stage2_invited_at: finalDay })],
      ["co_applicant:co-1", "co_applicant:co-2:running"])
    expect(await leadFinalNoticeForOthers(db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toEqual({ outcome: "sent" })
    expect(sent[0].contentHtml).toContain("2 of 3 parties have completed so far.")
  })

  it("KNOWN-GOOD twins: not due when the lead's own part is open, when no other party is in its final day, or for another org", async () => {
    const early = new Date(NOW.getTime() - 5 * DAY_MS).toISOString()
    const open = fakeDb({ stage2_invited_at: finalDay }, [co("co-1", { stage2_invited_at: finalDay })])
    expect(await leadFinalNoticeForOthers(open.db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toBeNull()
    const notYet = fakeDb({ searchworx_check_status: "complete", stage2_invited_at: early }, [co("co-1", { stage2_invited_at: early })])
    expect(await leadFinalNoticeForOthers(notYet.db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toBeNull()
    const allDone = fakeDb({ searchworx_check_status: "complete", stage2_invited_at: finalDay }, [co("co-1", { stage2_invited_at: finalDay, searchworx_check_status: "complete" })])
    expect(await leadFinalNoticeForOthers(allDone.db, { orgId: "org-A", applicationId: "app-1", now: NOW })).toBeNull()
    const other = fakeDb({ searchworx_check_status: "complete", stage2_invited_at: finalDay }, [co("co-1", { stage2_invited_at: finalDay })])
    expect(await leadFinalNoticeForOthers(other.db, { orgId: "org-B", applicationId: "app-1", now: NOW })).toBeNull()
    expect(sent).toEqual([])
  })
})

describe("N6 — sent after the run, once per recipient (notifyOutcome)", () => {
  const stamp = (ids: string[], m: number) => ({ assessedWith: { n: ids.length, m, completedSubjectIds: ids } })
  const done = { searchworx_check_status: "complete" }
  const scored = () => fakeDb(
    { ...done, fitscore_component_snapshot: stamp(["app-1", "co-1"], 3) },
    [co("co-1", done), co("co-2", { declined_at: "2026-10-05T00:00:00Z" })],
  )

  it("tells every party the score was computed on: the count, the closing sentence — no link without the group block", async () => {
    const { db, trail } = scored()
    await notifyOutcome(db, { orgId: "org-A", applicationId: "app-1" })
    expect(sent.map((s) => (s.to as { email: string }).email)).toEqual(["lead@example.test", "co-1@example.test"])
    for (const s of sent) {
      const html = String(s.contentHtml)
      expect(html).toContain("2 of 3")
      expect(html).toContain(ASSESSMENT_CLOSING_SENTENCE.replace("'", "&#39;"))
      expect(html).not.toContain("href")
    }
    expect(trail.filter((r) => r.milestone === "N6" && r.send_ok === true)).toHaveLength(2)
  })

  it("PLANTED: a live, complete party the stamp does not name is neither told nor named", async () => {
    const { db } = fakeDb(
      { ...done, fitscore_component_snapshot: stamp(["app-1", "co-1"], 3) },
      [co("co-1", done), co("co-2", done)],
    )
    await notifyOutcome(db, { orgId: "org-A", applicationId: "app-1" })
    expect(sent.map((s) => (s.to as { email: string }).email)).not.toContain("co-2@example.test")
    expect(sent).toHaveLength(2)
    for (const s of sent) expect(String(s.contentHtml)).not.toContain("CO-2")
  })

  it("a re-run of the orchestrator sends nothing twice", async () => {
    const { db } = scored()
    await notifyOutcome(db, { orgId: "org-A", applicationId: "app-1" })
    await notifyOutcome(db, { orgId: "org-A", applicationId: "app-1" })
    expect(sent).toHaveLength(2)
  })

  it("the link goes only to a recipient whose OWN consent recorded the group block", async () => {
    consents["cl-lead"] = { group_clause_shown: true, application_id: "app-1" }
    const { db } = fakeDb(
      { ...done, stage2_consent_log_id: "cl-lead", fitscore_component_snapshot: stamp(["app-1", "co-1"], 2) },
      [co("co-1", done)],
    )
    await notifyOutcome(db, { orgId: "org-A", applicationId: "app-1" })
    const html = (email: string) => String(sent.find((s) => (s.to as { email: string }).email === email)?.contentHtml)
    expect(html("lead@example.test")).toContain("/apply/result/")
    expect(html("co-1@example.test")).not.toContain("href")
  })

  it("PLANTED: a consent recorded WITHOUT the block, or for another application, carries no link", async () => {
    consents["cl-lead"] = { group_clause_shown: false, application_id: "app-1" }
    consents["cl-other"] = { group_clause_shown: true, application_id: "app-9" }
    for (const id of ["cl-lead", "cl-other"]) {
      sent.length = 0
      const { db } = fakeDb({ ...done, stage2_consent_log_id: id, fitscore_component_snapshot: stamp(["app-1"], 1) })
      await notifyOutcome(db, { orgId: "org-A", applicationId: "app-1" })
      expect(sent).toHaveLength(1)
      expect(String(sent[0].contentHtml)).not.toContain("href")
    }
  })

  it("a link that cannot be decided does not stop N6: it goes without one", async () => {
    consents["cl-lead"] = "boom"
    const { db, trail } = fakeDb({ ...done, stage2_consent_log_id: "cl-lead", fitscore_component_snapshot: stamp(["app-1"], 1) })
    await notifyOutcome(db, { orgId: "org-A", applicationId: "app-1" })
    expect(sent).toHaveLength(1)
    expect(String(sent[0].contentHtml)).not.toContain("href")
    expect(trail.filter((r) => r.milestone === "N6" && r.send_ok === true)).toHaveLength(1)
  })

  it("twins: no stamp, or another org's row, sends nothing", async () => {
    const bare = fakeDb(done, [co("co-1", done)])
    await notifyOutcome(bare.db, { orgId: "org-A", applicationId: "app-1" })
    const foreign = scored()
    await notifyOutcome(foreign.db, { orgId: "org-B", applicationId: "app-1" })
    expect(sent).toHaveLength(0)
  })
})
