/**
 * lib/actions/notices.test.ts — issueDemandToVacate wiring (E-2 walk list)
 *
 * Proves the real code path: the action READS the legal hold and FEEDS it to the (real) evaluator — a lease
 * on hold cannot reach issueTenantNotice; the E-5 order (instrument before effect); the mandatory override
 * reason; converge vs duplicate; and the manual-attestation signal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NoticeFacts } from "@/lib/notices/preconditions"

const H = vi.hoisted(() => {
  const state = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lease: null as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    priorNotices: [] as any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    factsOverride: {} as Partial<any>,
    hold: null as unknown,
    context: { tenantName: "John", contactId: "c1", tenantId: "t1", serviceAddress: "1 Main Rd", emails: ["a@x.test"], phones: [] as string[], sureties: [] as unknown[], needsManualAttestation: false },
    captured: { callOrder: [] as string[], leaseUpdates: [] as unknown[], lifecycle: [] as unknown[] },
  }
  const single = (table: string) => {
    if (table === "leases") return state.lease
    if (table === "organisations") return { name: "Acme" }
    return null
  }
  const list = (table: string) => (table === "tenant_notices" ? state.priorNotices : [])
  const updateChain = { eq: () => updateChain, then: (r: (x: { error: null }) => unknown) => r({ error: null }) }
  const db = {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain, eq: () => chain, is: () => chain, order: () => chain,
        maybeSingle: () => Promise.resolve({ data: single(table), error: null }),
        limit: (n: number) => Promise.resolve({ data: list(table).slice(0, n), error: null }),
        update: (vals: unknown) => { state.captured.callOrder.push("leaseUpdate"); state.captured.leaseUpdates.push(vals); return updateChain },
        insert: (vals: unknown) => {
          if (table === "lease_lifecycle_events") { state.captured.lifecycle.push(vals) }
          return Promise.resolve({ error: null })
        },
        then: (r: (x: { data: unknown[]; error: null }) => unknown) => r({ data: list(table), error: null }),
      }
      return chain
    },
  }
  return { state, db }
})

vi.mock("@/lib/auth/server", () => ({ requireAgentWriteAccess: vi.fn(async () => ({ db: H.db, userId: "u1", orgId: "o1" })) }))
vi.mock("@/lib/supabase/gateway", () => ({ gateway: vi.fn(async () => ({ db: H.db, userId: "u1", orgId: "o1" })) }))
vi.mock("@/lib/legal/holds", () => ({ isOnHold: vi.fn(async () => H.state.hold) }))
vi.mock("@/lib/notices/resolveNoticeContext", () => ({ resolveNoticeContext: vi.fn(async () => H.state.context) }))
vi.mock("@/lib/comms/send-email", () => ({ buildBranding: vi.fn(() => ({ orgName: "Acme" })), fetchOrgSettings: vi.fn(async () => ({})) }))
vi.mock("@/lib/org/displayName", () => ({ getOrgDisplayName: vi.fn(() => "Acme") }))
vi.mock("@/lib/notices/issueTenantNotice", () => ({
  issueTenantNotice: vi.fn(async (p: { manualOverride?: unknown }) => {
    H.state.captured.callOrder.push("issueTenantNotice")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(H.state.captured as any).lastManualOverride = p.manualOverride
    return { noticeId: "n1", vacateByDate: "2026-07-23", dispatched: [] }
  }),
  renderDemandNotice: vi.fn(async () => {
    H.state.captured.callOrder.push("renderDemandNotice")
    return { bodyFull: "<html>DEMAND TO VACATE</html>", contentHash: "h", vacateByDateISO: "2026-07-23", vacateByDateDisplay: "23 July 2026", todaysDate: "9 July 2026", citationBranch: "breach:cpa", mergeSnapshot: {} }
  }),
}))
// Keep the REAL evaluator; mock only the gatherer so it echoes the action-supplied activeLegalHold.
vi.mock("@/lib/notices/preconditions", async (orig) => {
  const actual = await orig<typeof import("@/lib/notices/preconditions")>()
  const clear: NoticeFacts = {
    today: "2026-07-09", leaseType: "residential", cpaApplies: "no", finalNoticeSentAt: "2026-05-01",
    arrearsResolved: false, priorSameTypeNotice: false, priorCancellation: false, renewalSignedOrInitiated: false,
    expiryNotificationSent: false, terminationNoticeGivenAt: "2026-05-01", noticePeriodEnd: "2026-06-01",
    terminationServiceEvidence: true, postTerminationReceipt: false, q13Flags: [], activeLegalHold: false,
  }
  return {
    ...actual,
    gatherNoticeFacts: vi.fn(async (_db, _org, _lease, _type, _today, activeLegalHold: boolean) =>
      ({ ...clear, ...H.state.factsOverride, activeLegalHold })),
  }
})

import { issueDemandToVacate, previewDemandToVacate } from "./notices"
import { issueTenantNotice } from "@/lib/notices/issueTenantNotice"

const baseLease = {
  id: "l1", lease_type: "residential", cpa_applies_at_signing: "no", status: "notice", unit_id: "u1", tenant_id: "t1",
  start_date: "2025-01-01", end_date: "2026-06-01", cancellation_effective_date: null, auto_renewal_notice_sent_at: null,
  expiry_reminder_sent_at: null, notice_given_date: "2026-05-01", notice_period_end: "2026-06-01",
  termination_notice_date: null, terminated_at: null, legal_review_flags: null, service_address: null,
  units: { unit_number: "1", properties: { name: "The Heights" } },
}

beforeEach(() => {
  vi.clearAllMocks()
  H.state.lease = { ...baseLease }
  H.state.priorNotices = []
  H.state.factsOverride = {}
  H.state.hold = null
  H.state.context = { tenantName: "John", contactId: "c1", tenantId: "t1", serviceAddress: "1 Main Rd", emails: ["a@x.test"], phones: [], sureties: [], needsManualAttestation: false }
  H.state.captured = { callOrder: [], leaseUpdates: [], lifecycle: [] }
})

describe("issueDemandToVacate — E-2 wiring", () => {
  it("REAL-PATH HOLD: a lease on active legal hold cannot reach issueTenantNotice", async () => {
    H.state.hold = { id: "hold1" }   // isOnHold returns a hold → the action must feed it to the guard
    const r = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_m2m" })
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ reason: "needs_override" })
    expect(issueTenantNotice).not.toHaveBeenCalled()
  })

  it("E-5 ORDERING: the notice-of-record is written BEFORE the lease effect", async () => {
    H.state.lease.status = "active"   // breach path
    const r = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_breach" })
    expect(r.ok).toBe(true)
    const order = H.state.captured.callOrder
    expect(order.indexOf("issueTenantNotice")).toBeGreaterThanOrEqual(0)
    expect(order.indexOf("issueTenantNotice")).toBeLessThan(order.indexOf("leaseUpdate"))
  })

  it("OVERRIDE REASON is genuinely mandatory (whitespace rejected)", async () => {
    H.state.factsOverride = { q13Flags: ["debt_review"] }   // → manual_review
    const noReason = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_m2m", override: { reason: "   " } })
    expect(noReason).toMatchObject({ ok: false, reason: "override_reason_required" })
    expect(issueTenantNotice).not.toHaveBeenCalled()
  })

  it("a valid override proceeds and records who/why/codes on the notice", async () => {
    H.state.factsOverride = { q13Flags: ["debt_review"] }
    const r = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_m2m", override: { reason: "Counsel confirmed debt review does not bar termination here." } })
    expect(r.ok).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mo = (H.state.captured as any).lastManualOverride
    expect(mo.reason).toContain("Counsel confirmed")
    expect(mo.codes).toContain("q13_flag")
    expect(mo.overridden_by).toBe("u1")
  })

  it("manual_review without an override returns needs_override + the suggestion, no generation", async () => {
    H.state.factsOverride = { cpaApplies: "indeterminate" }   // Rule 5 → suggest m2m
    const r = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_expiry" })
    expect(r).toMatchObject({ ok: false, reason: "needs_override", suggestedNoticeType: "demand_vacate_m2m" })
    expect(issueTenantNotice).not.toHaveBeenCalled()
  })

  it("CONVERGE: a prior incomplete notice re-applies the effect without re-generating, returning its date", async () => {
    H.state.priorNotices = [{ id: "nPrior", notice_type: "demand_vacate_breach", supersedes: null, cancellation_effective_date: "2026-07-01", vacate_by_date: "2026-07-15" }]
    H.state.lease.status = "active"   // effect NOT complete (not cancelled)
    const r = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_breach" })
    expect(r).toMatchObject({ ok: true, converged: true, noticeId: "nPrior", vacateByDate: "2026-07-15" })
    expect(issueTenantNotice).not.toHaveBeenCalled()
    expect(H.state.captured.leaseUpdates.length).toBeGreaterThan(0)
  })

  it("DUPLICATE: a prior notice whose effect is already complete is refused", async () => {
    H.state.priorNotices = [{ id: "nPrior", notice_type: "demand_vacate_breach", supersedes: null, cancellation_effective_date: "2026-07-01" }]
    H.state.lease.status = "cancelled"
    H.state.lease.cancellation_effective_date = "2026-07-01"   // effect complete
    const r = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_breach" })
    expect(r).toMatchObject({ ok: false, reason: "duplicate", noticeId: "nPrior" })
  })

  it("surfaces needsManualAttestation when there is no electronic service address", async () => {
    H.state.context = { ...H.state.context, emails: [], needsManualAttestation: true }
    H.state.lease.status = "active"
    const r = await issueDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_breach" })
    expect(r).toMatchObject({ ok: true, needsManualAttestation: true })
  })
})

describe("previewDemandToVacate — P-2: renders, never records", () => {
  it("returns html + precondition but writes ZERO rows anywhere (no issue, no lease effect)", async () => {
    H.state.lease.status = "active"
    const r = await previewDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_breach" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html).toContain("DEMAND TO VACATE")
    expect(r.precondition.decision).toBe("allow")
    expect(r.dates.cancellationEffective).toBe("9 July 2026")
    // The single boolean of distance: preview renders, never issues.
    expect(H.state.captured.callOrder).toContain("renderDemandNotice")
    expect(issueTenantNotice).not.toHaveBeenCalled()
    expect(H.state.captured.callOrder).not.toContain("leaseUpdate")
    expect(H.state.captured.leaseUpdates).toHaveLength(0)
    expect(H.state.captured.lifecycle).toHaveLength(0)
  })

  it("still surfaces block findings in preview so the agent sees why before confirming", async () => {
    H.state.factsOverride = { leaseType: "commercial" }
    const r = await previewDemandToVacate({ leaseId: "l1", noticeType: "demand_vacate_breach" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.precondition.decision).toBe("block")
    expect(issueTenantNotice).not.toHaveBeenCalled()
  })
})
