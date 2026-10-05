/**
 * lib/screening/__tests__/milestoneNotices.test.ts — 14X N3/N5/N6′: held copy records the gap once and sends nothing
 *
 * Notes:  ADDENDUM_14X §4/§5, probed both directions. HELD (the live state until counsel's rows read ready): no email
 *         leaves, and the trail gets ONE gap row per party per milestone however many runs see it due. RELEASED (the
 *         registry hold lifted, simulated): the email is sent and trailed. N3: the completer is never told about
 *         themselves, a declined party is neither told nor listed, the lead is always told, and nobody outstanding
 *         fires nothing. N6′ never carries a link (§5) and names nobody; the lead's variants never promise an
 *         assessment the lead's absence prevents. Every applicant-typed name is escaped.
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
  FINAL_NOTICE_KEY, OUTCOME_ABSENT_KEY, PROGRESS_KEY, finalNoticeCopy, notifyProgress, outcomeAbsentCopy, progressCopy,
  sendMilestoneNotice,
} from "../milestoneNotices"
import { heldFor } from "@/lib/comms/template-registry"

type Row = Record<string, unknown>
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
        if (table !== "applications" || filters.org_id !== "org-A") return { data: null, error: null }
        return { data: {
          id: "app-1", org_id: "org-A", entity_type: "individual", first_name: "Lead", last_name: "Party",
          applicant_email: "lead@example.test", stage2_invited_at: INVITED, searchworx_check_status: "pending",
          listings: { units: { unit_number: "4", properties: { name: "Oak Court" } } }, ...lead,
        }, error: null }
      }
      b.insert = async (row: Row) => { trail.push(row); return { error: null } }
      if (table === "v_application_screening_lines") {
        b.then = (resolve: (v: unknown) => void) => resolve({
          data: filters.org_id === "org-A" ? paid.map((key) => {
            const [subject_type, subject_id] = key.split(":")
            return { subject_type, subject_id, paid_at: "2026-10-01T00:00:00Z" }
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

const n5 = (db: SupabaseClient) => sendMilestoneNotice(db, {
  orgId: "org-A", applicationId: "app-1", subject: { subjectType: "co_applicant", subjectId: "co-1" }, milestone: "N5",
  templateKey: FINAL_NOTICE_KEY, deadlineAsStated: "2026-10-15", to: { email: "co-1@example.test", name: "C" },
  copy: { subject: "s", html: "h" }, triggerEventType: "test",
})

beforeEach(() => { sent.length = 0; released = false })

describe("the copy is held until counsel approves it", () => {
  it("every new 14X template is registered AND held", () => {
    for (const key of [PROGRESS_KEY, FINAL_NOTICE_KEY, OUTCOME_ABSENT_KEY, "application.screening_outcome"]) {
      expect(heldFor(key)).toMatch(/COUNSEL_DRAFT_14X/)
    }
  })

  it("PLANTED: a held milestone sends nothing and records ONE gap row, however many runs see it due", async () => {
    const { db, trail } = fakeDb()
    expect(await n5(db)).toEqual({ outcome: "held" })
    expect(await n5(db)).toEqual({ outcome: "held" })
    expect(sent).toEqual([])
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({
      milestone: "N5", template_key: FINAL_NOTICE_KEY, send_ok: false, communication_log_id: null, deadline_as_stated: "2026-10-15",
    })
  })

  it("KNOWN-GOOD: released, the notice is sent and its attempt trailed with the delivery row", async () => {
    released = true
    const { db, trail } = fakeDb()
    expect(await n5(db)).toEqual({ outcome: "sent" })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ templateKey: FINAL_NOTICE_KEY, entityType: "application_co_applicant", entityId: "co-1" })
    expect(trail).toEqual([expect.objectContaining({ milestone: "N5", send_ok: true, communication_log_id: "log-1" })])
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
      expect(s.contentHtml).toContain("We are waiting on: Lead Party and CO-2 Co.")
      expect(s.contentHtml).not.toContain("CO-3")
    }
  })

  it("an already-complete co party is listed nowhere and told nothing; the lead is still told", async () => {
    const { db } = fakeDb({}, [co("co-1"), co("co-2", { searchworx_check_status: "complete" })])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["lead@example.test"])
    expect(sent[0].contentHtml).toContain("We are waiting on: Lead Party.")
  })

  it("an uninvited co party is waited on but not told (it has no link to act on)", async () => {
    const { db } = fakeDb({ searchworx_check_status: "complete" }, [co("co-1"), co("co-2", { stage2_invited_at: null })])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["lead@example.test"])
    expect(sent[0].contentHtml).toContain("We are waiting on: CO-2 Co.")
  })

  it("PLANTED (walker 14x-p4 F3): a party past its own D, unpaid and not yet declined, is neither named nor told", async () => {
    const { db } = fakeDb({ stage2_invited_at: LAPSED }, [co("co-1"), co("co-2", { stage2_invited_at: LAPSED }), co("co-3")])
    await notifyProgress(db, { orgId: "org-A", applicationId: "app-1", completed: { subjectType: "co_applicant", subjectId: "co-1" } })
    expect(recipients()).toEqual(["co-3@example.test"])
    expect(sent[0].contentHtml).toContain("We are waiting on: CO-3 Co.")
    expect(sent[0].contentHtml).not.toMatch(/CO-2|Lead Party/)
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
    expect(sent[0].contentHtml).toContain("We are waiting on: Lead Party.")
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
    const { html } = progressCopy({ firstName: "<b>", completedName: "A & B", outstanding: ["<script>x</script>"], propertyLabel: "P" })
    expect(html).not.toContain("<script>")
    expect(html).toContain("A &amp; B")
    expect(html).toContain("&lt;b&gt;")
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
      .toMatch(/assessed without you/)
  })
})
