/**
 * lib/notices/issueTenantNotice.test.ts — dispatch path: notice-of-record + escalated service + gate
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/comms/send-email", () => ({ sendEmail: vi.fn(async () => ({ success: true, logId: "log-1" })) }))
vi.mock("@/lib/sms/sendSMS", () => ({ sendSMS: vi.fn(async () => ({ sent: true, logId: "sms-1" })) }))

import { issueTenantNotice } from "./issueTenantNotice"
import { sendEmail } from "@/lib/comms/send-email"
import { sendSMS } from "@/lib/sms/sendSMS"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(opts: { template?: any; microTemplate?: any } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserts: Record<string, any[]> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filters: Record<string, any> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eq: (col: string, val: any) => { filters[col] = val; return chain },
        maybeSingle: () => {
          if (table !== "document_templates") return Promise.resolve({ data: null, error: null })
          const data = filters["template_key"] === "notice.service_notification" ? (opts.microTemplate ?? null) : (opts.template ?? null)
          return Promise.resolve({ data, error: null })
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert(row: any) {
          inserts[table] = inserts[table] ?? []
          inserts[table].push(row)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p: any = Promise.resolve({ error: null })
          p.select = () => ({ single: () => Promise.resolve({ data: { id: "notice-1" }, error: null }) })
          return p
        },
      }
      return chain
    },
  }
  return { db, inserts }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseParams = (db: any) => ({
  db, orgId: "org-1", generatedBy: "user-1", now: new Date("2026-07-06T09:00:00Z"),
  lease: {
    id: "lease-1", noticeType: "demand_vacate_breach" as const, cpaApplies: "yes" as const,
    finalNoticeDate: "1 June 2026", cancellationEffectiveDate: "1 July 2026", cancellationEffectiveISO: "2026-07-01",
  },
  recipient: {
    tenantName: "John Doe", contactId: "c-1", tenantId: "t-1", serviceAddress: "1 Main Rd",
    emails: ["a@x.test", "b@x.test", "a@x.test"], phones: ["+27110000000"],
  },
  sureties: [{ contactId: "s-1", name: "Jane Surety", email: "surety@x.test" }],
  landlordOrAgentName: "Acme", propertyLabel: "Unit 1", referenceNumber: "DTV-1",
  branding: { orgName: "Acme", orgEmail: "h@acme.test" },
})

const approvedTmpl = { id: "tmpl-1", version: 1, legal_review_status: "approved" }

beforeEach(() => { vi.clearAllMocks(); delete process.env.VERCEL_ENV })

describe("issueTenantNotice", () => {
  it("creates the immutable notice-of-record with a content_hash over the rendered body", async () => {
    const { db, inserts } = makeDb({ template: approvedTmpl })
    const res = await issueTenantNotice(baseParams(db))
    expect(res.noticeId).toBe("notice-1")
    expect(res.vacateByDate).toBe("2026-07-20")   // 6 Jul + 14
    const row = inserts["tenant_notices"][0]
    expect(row.content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(row.body_full).toContain("DEMAND TO VACATE")
    expect(row.notice_type).toBe("demand_vacate_breach")
    expect(row.citation_branch).toBe("breach:cpa")
    expect(row.vacate_by_date).toBe("2026-07-20")
    expect(row.cancellation_effective_date).toBe("2026-07-01")
  })

  it("byte-identity: every send uses rawHtml === the stored body_full (R-3)", async () => {
    const { db, inserts } = makeDb({ template: approvedTmpl })
    await issueTenantNotice(baseParams(db))
    const bodyFull = inserts["tenant_notices"][0].body_full
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const call of (sendEmail as any).mock.calls) expect(call[0].rawHtml).toBe(bodyFull)
  })

  it("escalated fan-out: dedup emails + phones + surety, each an entity-linked send + a service event", async () => {
    const { db, inserts } = makeDb({ template: approvedTmpl })
    const res = await issueTenantNotice(baseParams(db))
    expect((sendEmail as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3)  // 2 unique tenant + 1 surety
    expect((sendSMS as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
    expect(inserts["notice_service_events"]).toHaveLength(4)                    // 3 email + 1 sms 'dispatched'
    expect(res.dispatched.filter((d) => d.channel === "email")).toHaveLength(3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const call of (sendEmail as any).mock.calls) {
      expect(call[0].entityType).toBe("tenant_notice")
      expect(call[0].entityId).toBe("notice-1")
    }
    // surety copy is marked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suretyCall = (sendEmail as any).mock.calls.find((c: any) => c[0].to.email === "surety@x.test")
    expect(suretyCall[0].subject).toMatch(/Copy served on surety/)
  })

  it("issuance audit is PII-safe (hash + type only, no recipient PII)", async () => {
    const { db, inserts } = makeDb({ template: approvedTmpl })
    await issueTenantNotice(baseParams(db))
    const audit = inserts["audit_log"][0]
    expect(audit.action).toBe("INSERT")
    expect(audit.new_values.content_hash).toMatch(/^[a-f0-9]{64}$/)
    const blob = JSON.stringify(audit.new_values)
    expect(blob).not.toContain("John Doe")
    expect(blob).not.toContain("Main Rd")
  })

  it("records the demand_to_vacate_issued lifecycle event", async () => {
    const { db, inserts } = makeDb({ template: approvedTmpl })
    await issueTenantNotice(baseParams(db))
    expect(inserts["lease_lifecycle_events"][0].event_type).toBe("demand_to_vacate_issued")
  })

  it("refuses a non-approved letter in production (R-1 gate)", async () => {
    process.env.VERCEL_ENV = "production"
    const { db } = makeDb({ template: { id: "t", version: 1, legal_review_status: "draft" } })
    await expect(issueTenantNotice(baseParams(db))).rejects.toThrow(/not counsel-approved|refused|NoticeGate/i)
  })

  it("fail-CLOSED: an UNKNOWN env (not dev/preview/test) gates ON even without VERCEL_ENV", async () => {
    delete process.env.VERCEL_ENV
    const prev = process.env.NODE_ENV
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.env as any).NODE_ENV = "staging"   // not in the allowlist → gate must engage
    const { db } = makeDb({ template: { id: "t", version: 1, legal_review_status: "draft" } })
    await expect(issueTenantNotice(baseParams(db))).rejects.toThrow(/NoticeGate|approved/i)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.env as any).NODE_ENV = prev
  })

  it("gates the SMS micro-template too: approved letter + draft micro + phones → refused in production", async () => {
    process.env.VERCEL_ENV = "production"
    const { db } = makeDb({ template: approvedTmpl, microTemplate: { legal_review_status: "draft" } })
    await expect(issueTenantNotice(baseParams(db))).rejects.toThrow(/service_notification|NoticeGate/i)
  })

  it("production send succeeds when BOTH the letter and the micro-template are approved", async () => {
    process.env.VERCEL_ENV = "production"
    const { db } = makeDb({ template: approvedTmpl, microTemplate: { legal_review_status: "approved" } })
    const res = await issueTenantNotice(baseParams(db))
    expect(res.noticeId).toBe("notice-1")
  })

  it("allows a draft template outside production (dev/preview/test)", async () => {
    const { db } = makeDb({ template: { id: "t", version: 1, legal_review_status: "draft" } })
    const res = await issueTenantNotice(baseParams(db))
    expect(res.noticeId).toBe("notice-1")
  })

  it("cites the contractual branch when cpaApplies is not 'yes'", async () => {
    const { db, inserts } = makeDb({ template: approvedTmpl })
    const p = baseParams(db)
    p.lease.cpaApplies = "indeterminate" as unknown as "yes"
    await issueTenantNotice(p)
    expect(inserts["tenant_notices"][0].citation_branch).toBe("breach:contractual")
  })
})
