"use server"
/**
 * lib/actions/notices.ts — issueDemandToVacate agent action (LEG-NOTICES-01 Phase E-2)
 *
 * Auth:   requireAgentWriteAccess("issue_demand_to_vacate") — a Demand to Vacate is net-new value creation.
 * Data:   leases, tenant_notices, notice_service_events, communication_log, audit_log, lease_lifecycle_events,
 *         legal_hold_events (via lib/legal/holds), arrears_* (via preconditions)
 * Notes:  Wires the E-1 guard engine to the D dispatch path. Order of operations is E-5: the notice-of-record
 *         (the operative cancellation INSTRUMENT, Option A) is written + dispatched FIRST; the lease EFFECT
 *         (status='cancelled' / date columns) SECOND — so a failure can only ever leave a lagging lease row
 *         (coherent, convergeable), never a cancelled lease with no instrument. A retry converges the effect
 *         idempotently keyed on the existing notice id — it does NOT re-generate (Rule 13) or self-flag
 *         Rule 2. activeLegalHold is read HERE on the real path (not trusted from a caller). A manual-review
 *         halt requires an explicit override with a genuinely-mandatory reason, recorded on the immutable
 *         notice. No electronic service address → manual-attestation territory, never a silent email fan-out.
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { isOnHold } from "@/lib/legal/holds"
import { getOrgDisplayName } from "@/lib/org/displayName"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { SupabaseClient } from "@supabase/supabase-js"
import { gatherNoticeFacts, evaluateNoticePreconditions, type GatherLease, type PreconditionFinding } from "@/lib/notices/preconditions"
import { resolveNoticeContext, type ContextLease } from "@/lib/notices/resolveNoticeContext"
import { saTodayISO } from "@/lib/notices/vacateDate"
import { issueTenantNotice, type DemandNoticeType, type ManualOverride } from "@/lib/notices/issueTenantNotice"

export interface IssueDemandInput {
  leaseId: string
  noticeType: DemandNoticeType
  /** Present when the agent confirms an override of a manual-review halt. reason must be non-empty. */
  override?: { reason: string }
}

export type IssueDemandResult =
  | { ok: true; noticeId: string; vacateByDate: string; dispatched: Array<{ channel: string; address: string; success: boolean }>; needsManualAttestation: boolean; converged?: boolean }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "blocked"; findings: PreconditionFinding[] }
  | { ok: false; reason: "needs_override"; findings: PreconditionFinding[]; suggestedNoticeType?: DemandNoticeType }
  | { ok: false; reason: "override_reason_required" }
  | { ok: false; reason: "duplicate"; noticeId: string }

type Db = SupabaseClient

interface ActionLease extends GatherLease {
  termination_notice_date: string | null
  terminated_at: string | null
  service_address: Record<string, unknown> | null
  end_date: string | null
}

const LEASE_COLS =
  "id, lease_type, cpa_applies_at_signing, status, unit_id, tenant_id, start_date, end_date, " +
  "cancellation_effective_date, auto_renewal_notice_sent_at, expiry_reminder_sent_at, notice_given_date, " +
  "notice_period_end, termination_notice_date, terminated_at, legal_review_flags, service_address, " +
  "units(unit_number, properties(name))"

const fmt = (iso: string | null): string =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : ""

/** The lease effect is "complete" for this type → a re-call is a genuine duplicate, not a converge. */
function leaseEffectComplete(lease: ActionLease, type: DemandNoticeType): boolean {
  if (type === "demand_vacate_breach") return lease.status === "cancelled" && Boolean(lease.cancellation_effective_date)
  if (type === "demand_vacate_m2m") return Boolean(lease.termination_notice_date)
  return Boolean(lease.terminated_at)
}

/** Apply the lease EFFECT (E-5 second write). Idempotent; emits the terminal lifecycle only on transition. */
async function applyLeaseEffect(db: Db, orgId: string, lease: ActionLease, type: DemandNoticeType, userId: string | null, cancellationISO: string, finalNoticeSentAt: string | null): Promise<void> {
  if (type === "demand_vacate_breach") {
    const wasCancelled = lease.status === "cancelled"
    const { error } = await db.from("leases")
      .update({ status: "cancelled", cancellation_effective_date: cancellationISO, final_notice_date: finalNoticeSentAt })
      .eq("id", lease.id).eq("org_id", orgId)
    logQueryError("applyLeaseEffect breach", error)
    if (!wasCancelled) {
      await db.from("lease_lifecycle_events").insert({
        org_id: orgId, lease_id: lease.id, event_type: "lease_cancelled_for_breach",
        description: "Lease cancelled for breach (Demand to Vacate)", metadata: { cancellation_effective_date: cancellationISO },
        triggered_by: "agent", triggered_by_user: userId,
      })
    }
  } else if (type === "demand_vacate_m2m") {
    const { error } = await db.from("leases").update({ termination_notice_date: lease.notice_given_date }).eq("id", lease.id).eq("org_id", orgId)
    logQueryError("applyLeaseEffect m2m", error)
  } else {
    const { error } = await db.from("leases").update({ terminated_at: new Date().toISOString() }).eq("id", lease.id).eq("org_id", orgId)
    logQueryError("applyLeaseEffect expiry", error)
  }
}

/** An existing non-superseded notice of this type on the lease (for converge / duplicate detection). */
async function findLiveNoticeOfType(db: Db, orgId: string, leaseId: string, type: DemandNoticeType): Promise<{ id: string; cancellation_effective_date: string | null; vacate_by_date: string | null } | null> {
  const { data, error } = await db.from("tenant_notices")
    .select("id, notice_type, supersedes, cancellation_effective_date, vacate_by_date").eq("org_id", orgId).eq("lease_id", leaseId)
  logQueryError("findLiveNoticeOfType", error)
  const rows = data ?? []
  const supersededIds = new Set(rows.map((r) => r.supersedes).filter(Boolean))
  const row = rows.find((r) => r.notice_type === type && !supersededIds.has(r.id))
  return row ? { id: row.id as string, cancellation_effective_date: (row.cancellation_effective_date as string | null) ?? null, vacate_by_date: (row.vacate_by_date as string | null) ?? null } : null
}

/** Build the issueTenantNotice `lease` sub-object (display dates) for a type. cancellationISO = today (Option A). */
function noticeLeaseInput(lease: ActionLease, type: DemandNoticeType, finalNoticeSentAt: string | null, todayISO: string) {
  return {
    id: lease.id, noticeType: type, cpaApplies: lease.cpa_applies_at_signing,
    finalNoticeDate: fmt(finalNoticeSentAt), cancellationEffectiveDate: fmt(todayISO), cancellationEffectiveISO: todayISO,
    leaseEndDate: fmt(type === "demand_vacate_m2m" ? lease.notice_period_end : lease.end_date),
    terminationNoticeDate: fmt(lease.notice_given_date),
  }
}

async function fetchActionLease(db: Db, orgId: string, leaseId: string) {
  const { data, error } = await db.from("leases").select(LEASE_COLS).eq("id", leaseId).eq("org_id", orgId).maybeSingle()
  logQueryError("issueDemandToVacate fetch lease", error)
  if (!data) return null
  const row = data as unknown as ActionLease & { units: { unit_number?: string; properties?: { name?: string } } | null }
  const unit = row.units
  const propertyLabel = unit ? `${unit.unit_number ?? "Unit"}, ${unit.properties?.name ?? ""}`.trim() : "the premises"
  const { data: org, error: orgErr } = await db.from("organisations")
    .select("name, type, trading_as, first_name, last_name, title, initials").eq("id", orgId).maybeSingle()
  logQueryError("issueDemandToVacate fetch org", orgErr)
  const orgSettings = await fetchOrgSettings(orgId)
  return { lease: data as unknown as ActionLease, propertyLabel, orgName: org ? getOrgDisplayName(org) : "Pleks", branding: buildBranding(orgSettings) }
}

/**
 * Issue a Demand to Vacate for a lease. Runs the E-1 guards, honours an E-4 override, and executes the
 * E-5 order (instrument then effect, with idempotent converge on retry). Returns a discriminated result the
 * UI drives the scenario picker / override prompt from.
 */
export async function issueDemandToVacate(input: IssueDemandInput): Promise<IssueDemandResult> {
  const gw = await requireAgentWriteAccess("issue_demand_to_vacate")
  const { db, userId, orgId } = gw
  const type = input.noticeType
  const todayISO = saTodayISO()   // SAST calendar date — legal dates must not be UTC (see saTodayISO)

  const fetched = await fetchActionLease(db, orgId, input.leaseId)
  if (!fetched) return { ok: false, reason: "not_found" }
  const { lease, propertyLabel, orgName, branding } = fetched

  // Converge / duplicate — reconcile via the notice-id link BEFORE the guards, so a retry after a failed
  // lease-write neither re-generates (Rule 13) nor self-flags Rule 2 against its own instrument (E-5).
  // A legal hold arriving between instrument and converge deliberately does NOT stop the converge: the
  // instrument already exists, so the lease row must be made to match it. The hold gates NEW instruments only.
  const existing = await findLiveNoticeOfType(db, orgId, input.leaseId, type)
  if (existing) {
    if (leaseEffectComplete(lease, type)) return { ok: false, reason: "duplicate", noticeId: existing.id }
    await applyLeaseEffect(db, orgId, lease, type, userId, existing.cancellation_effective_date ?? todayISO, null)
    return { ok: true, noticeId: existing.id, vacateByDate: existing.vacate_by_date ?? "", dispatched: [], needsManualAttestation: false, converged: true }
  }

  // Real-path hold read — the guard's input is fetched HERE, never trusted from a caller.
  const activeLegalHold = (await isOnHold(db, { scopeType: "lease", scopeId: input.leaseId })) !== null
  const facts = await gatherNoticeFacts(db, orgId, lease, type, todayISO, activeLegalHold)
  const result = evaluateNoticePreconditions(facts, type)

  if (result.decision === "block") return { ok: false, reason: "blocked", findings: result.blocks }

  let manualOverride: ManualOverride | undefined
  if (result.decision === "manual_review") {
    if (!input.override) return { ok: false, reason: "needs_override", findings: result.reviews, suggestedNoticeType: result.suggestedNoticeType }
    if (!input.override.reason?.trim()) return { ok: false, reason: "override_reason_required" }
    manualOverride = { overridden_by: userId, overridden_at: new Date().toISOString(), reason: input.override.reason.trim(), codes: result.reviews.map((r) => r.code) }
  }

  const ctxLease: ContextLease = { id: lease.id, tenant_id: lease.tenant_id as string, service_address: lease.service_address as ContextLease["service_address"] }
  const context = await resolveNoticeContext(db, orgId, ctxLease)

  // E-5 — the INSTRUMENT first (notice-of-record insert + dispatch)…
  const issued = await issueTenantNotice({
    db, orgId, generatedBy: userId, now: new Date(),
    lease: noticeLeaseInput(lease, type, facts.finalNoticeSentAt, todayISO),
    recipient: { tenantName: context.tenantName, contactId: context.contactId, tenantId: context.tenantId, serviceAddress: context.serviceAddress, emails: context.emails, phones: context.phones },
    sureties: context.sureties.map((s) => ({ contactId: s.contactId, name: s.name, email: s.email })),
    landlordOrAgentName: orgName, propertyLabel, referenceNumber: `DTV-${input.leaseId.slice(0, 8).toUpperCase()}-${todayISO.replaceAll("-", "")}`,
    branding, manualOverride,
  })

  // …the EFFECT second (idempotent lease write). A failure here leaves a lagging lease row → next call converges.
  await applyLeaseEffect(db, orgId, lease, type, userId, todayISO, facts.finalNoticeSentAt)

  return { ok: true, noticeId: issued.noticeId, vacateByDate: issued.vacateByDate, dispatched: issued.dispatched, needsManualAttestation: context.needsManualAttestation }
}
