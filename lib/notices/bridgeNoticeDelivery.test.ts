/**
 * lib/notices/bridgeNoticeDelivery.test.ts — webhook → notice_service_events append-only bridge
 */
import { describe, it, expect } from "vitest"
import { bridgeNoticeDelivery } from "./bridgeNoticeDelivery"

function makeDb(opts: { vacateByDate?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserts: Record<string, any[]> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: table === "tenant_notices" ? { vacate_by_date: opts.vacateByDate ?? null } : null, error: null }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert(row: any) { inserts[table] = inserts[table] ?? []; inserts[table].push(row); return Promise.resolve({ error: null }) },
      }
      return chain
    },
  }
  return { db, inserts }
}

const noticeLog = { org_id: "org-1", entity_type: "tenant_notice", entity_id: "notice-1", channel: "email", sent_to_email: "a@x.test" }

describe("bridgeNoticeDelivery (append-only, deemed-service anchor on 'delivered')", () => {
  it("no-op for a comm log that is not a served notice", async () => {
    const { db, inserts } = makeDb()
    await bridgeNoticeDelivery(db, { ...noticeLog, entity_type: "individual" }, "delivered", "2026-07-08T00:00:00Z", "evt-1")
    expect(inserts["notice_service_events"]).toBeUndefined()
  })

  it("delivered → a 'delivered' event carrying deemed_service_at; no short-service flag when ≥ floor", async () => {
    const { db, inserts } = makeDb({ vacateByDate: "2026-07-20" })
    await bridgeNoticeDelivery(db, noticeLog, "delivered", "2026-07-08T06:00:00Z", "evt-1")
    const ev = inserts["notice_service_events"][0]
    expect(ev.status).toBe("delivered")
    expect(ev.deemed_service_at).toBe("2026-07-08T06:00:00Z")
    expect(ev.channel).toBe("email")
    expect(inserts["audit_log"]).toBeUndefined()
  })

  it("delivered with a short vacate period flags notice_service_short as a NOTE (R-2)", async () => {
    const { db, inserts } = makeDb({ vacateByDate: "2026-07-10" })
    await bridgeNoticeDelivery(db, noticeLog, "delivered", "2026-07-08T06:00:00Z", "evt-1")  // 2 days < 7
    expect(inserts["audit_log"][0].new_values.event).toBe("notice_service_short")
    expect(inserts["audit_log"][0].action).toBe("NOTE")
  })

  it("bounced_hard → a 'bounced' event, no deemed_service_at", async () => {
    const { db, inserts } = makeDb({ vacateByDate: "2026-07-20" })
    await bridgeNoticeDelivery(db, { ...noticeLog, channel: "sms", sent_to_phone: "+2711", sent_to_email: null }, "bounced_hard", "2026-07-08T06:00:00Z", "evt-1")
    const ev = inserts["notice_service_events"][0]
    expect(ev.status).toBe("bounced")
    expect(ev.deemed_service_at).toBeNull()
    expect(ev.channel).toBe("sms")
  })

  it("ignores non-service events (opened / queued)", async () => {
    const { db, inserts } = makeDb({ vacateByDate: "2026-07-20" })
    await bridgeNoticeDelivery(db, noticeLog, "opened", "2026-07-08T06:00:00Z", "evt-1")
    expect(inserts["notice_service_events"]).toBeUndefined()
  })
})
