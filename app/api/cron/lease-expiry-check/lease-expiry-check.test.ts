/**
 * lease-expiry-check.test.ts — H-1: send failure must NOT stamp "notified" (comms audit 2026-07-09)
 *
 * expiry_reminder_sent_at is what the Demand-to-Vacate Rule 5 guard reads as "CPA s14(2)(b)(ii) expiry
 * notification duly given." During the June outage the stamp landed on failed sends. The fix stamps only on
 * routeAndSend().success; this pins it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const H = vi.hoisted(() => ({ success: true }))

vi.mock("@/lib/messaging/router", () => ({ routeAndSend: vi.fn(async () => ({ success: H.success })) }))
vi.mock("@/lib/comms/send-email", () => ({ fetchOrgSettings: vi.fn(async () => ({})), buildBranding: vi.fn(() => ({ orgName: "P" })) }))

import { handleExpiryReminder } from "./route"

function rowFor(table: string): unknown {
  if (table === "tenant_view") return { email: "t@x.test", first_name: "T", last_name: "N", phone: null }
  if (table === "units") return { unit_number: "1", properties: { name: "The Heights" } }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(): { db: any; captured: { leaseUpdate: any } } {
  const captured = { leaseUpdate: null as unknown }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: () => Promise.resolve({ data: rowFor(table), error: null }),
        update: (vals: unknown) => {
          if (table === "leases") { captured.leaseUpdate = vals }
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
      return chain
    },
  }
  return { db, captured }
}

const lease = { id: "l1", org_id: "o1", tenant_id: "t1", end_date: "2026-08-01", unit_id: "u1", cpa_applies_at_signing: "yes" as const }

beforeEach(() => { H.success = true })

describe("handleExpiryReminder — H-1 stamp-on-success", () => {
  it("a FAILED send leaves expiry_reminder_sent_at null (never marks a lease 'notified')", async () => {
    H.success = false
    const { db, captured } = makeDb()
    await handleExpiryReminder(db, lease)
    expect(captured.leaseUpdate).toBeNull()   // no stamp — the poison the audit found
  })

  it("a SUCCESSFUL send stamps expiry_reminder_sent_at", async () => {
    H.success = true
    const { db, captured } = makeDb()
    await handleExpiryReminder(db, lease)
    expect(captured.leaseUpdate).toHaveProperty("expiry_reminder_sent_at")
  })
})
