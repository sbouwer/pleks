/**
 * lib/notices/issueTenantNotice.ts — issue a Demand-to-Vacate: notice-of-record + escalated service
 *
 * Auth:   service-role (called from the slice-E agent action, which does the requireAgentWriteAccess gate)
 * Data:   document_templates (gate), tenant_notices (immutable register), notice_service_events (service
 *         log), communication_log (via sendEmail/sendSMS), audit_log, lease_lifecycle_events, lease_sureties
 * Notes:  LEG-NOTICES-01 Phase D. The dispatch path — NOT the agent action (slice E) and NOT the
 *         precondition guards (Rules 1–8, slice E). Renders the canonical notice ONCE → body_full; the
 *         Rule-10 content_hash (R-3) and every transmitted copy derive from that one string (byte-identity).
 *         Escalated fan-out (R-4/Q12): the FULL notice to every service email + a short notification-of-
 *         service micro-template to every phone + a marked copy to each surety of record (E11) — send to
 *         ALL, a bounce never silences (each is a logged service event). Per-channel deemed-service timing
 *         is captured LATER on the delivered notice_service_events row by the webhook bridge (R-2), never
 *         here. Production draft-gate: refuses to generate a non-'approved' template in production
 *         (VERCEL_ENV==='production'); dev/preview render for testing (R-1 / plan §0).
 */

import * as React from "react"
import { render } from "@react-email/components"
import { createHash } from "node:crypto"
import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { sendEmail } from "@/lib/comms/send-email"
import { sendSMS } from "@/lib/sms/sendSMS"
import { recordNoticeServiceEvent } from "./recordServiceEvent"
import { computeVacateByDate } from "./vacateDate"
import { saDateISO } from "@/lib/dates"
import { renderServiceNotificationSms } from "./serviceNotification"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import type { CpaAppliesState } from "@/lib/comms/templates/legalCitations"
import { DemandToVacateBreachEmail } from "@/lib/comms/templates/tenant/leases/demand-to-vacate-breach"
import { DemandToVacateExpiryEmail } from "@/lib/comms/templates/tenant/leases/demand-to-vacate-expiry"
import { DemandToVacateM2mEmail } from "@/lib/comms/templates/tenant/leases/demand-to-vacate-m2m"

type Db = Awaited<ReturnType<typeof createServiceClient>>

export type DemandNoticeType = "demand_vacate_breach" | "demand_vacate_expiry" | "demand_vacate_m2m"

export interface IssueTenantNoticeParams {
  db: Db
  orgId: string
  generatedBy: string | null
  now: Date                       // injected → deterministic vacate-date + dispatch timestamp
  lease: {
    id: string
    noticeType: DemandNoticeType
    cpaApplies: CpaAppliesState
    /** Display strings (already formatted by the caller) for the notice body. */
    finalNoticeDate?: string | null            // breach
    cancellationEffectiveDate?: string | null  // breach — also stored ISO in cancellationEffectiveISO
    cancellationEffectiveISO?: string | null   // breach — the date column value
    leaseEndDate?: string | null               // expiry, m2m
    terminationNoticeDate?: string | null      // m2m
  }
  recipient: {
    tenantName: string
    contactId?: string | null
    tenantId?: string | null
    serviceAddress: string        // domicilium display string (frozen into merge_snapshot)
    emails: string[]              // every address to serve (escalated fan-out)
    phones?: string[]
  }
  sureties?: Array<{ contactId?: string | null; name: string; email?: string | null }>
  landlordOrAgentName: string
  propertyLabel: string
  referenceNumber: string
  branding: OrgBranding
  /** E-4 override — set ONLY when a manual-review halt was overridden. Recorded on the immutable row at insert. */
  manualOverride?: ManualOverride
}

/** The E-4 override block persisted on tenant_notices.manual_override (set-at-insert only). */
export interface ManualOverride {
  overridden_by: string | null
  overridden_at: string
  reason: string
  codes: string[]
}

export interface IssueTenantNoticeResult {
  noticeId: string
  vacateByDate: string
  dispatched: Array<{ channel: string; address: string; success: boolean }>
}

export class NoticeGateError extends Error {
  constructor(templateKey: string, status: string | null) {
    super(`Demand-to-Vacate '${templateKey}' is '${status ?? "unregistered"}', not counsel-approved — refused in production (LEG-NOTICES-01 R-1)`)
    this.name = "NoticeGateError"
  }
}

const SUBJECTS: Record<DemandNoticeType, string> = {
  demand_vacate_breach: "Demand to vacate following lease cancellation",
  demand_vacate_expiry: "Demand to vacate following lease expiry",
  demand_vacate_m2m: "Demand to vacate following termination on notice",
}

// Fail-CLOSED gate (CD, Phase D walk). Only recognised dev/preview/test environments may render a
// NON-approved notice; an unknown or absent env gates ON. The single control between a draft legal
// instrument and a tenant's inbox must NOT depend on an env var being present — only on it being a
// recognised safe value. (Inverting the Phase-A default-'draft' polarity mistake I'd already ruled against.)
const DRAFT_RENDER_ENVS = new Set(["development", "preview", "test"])
function allowDraftRender(): boolean {
  return DRAFT_RENDER_ENVS.has(process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "")
}

/** Production gate: every suite template that WILL actually be sent must be counsel-approved. Outside the
 *  allowlisted render envs, a non-approved letter — or (when SMS will send) a non-approved
 *  notice.service_notification micro-template (same approval event) — refuses generation. */
async function assertNoticeApproved(db: Db, letterKey: string, letterStatus: string | null | undefined, willSendSms: boolean): Promise<void> {
  if (allowDraftRender()) return
  if (letterStatus !== "approved") throw new NoticeGateError(letterKey, letterStatus ?? null)
  if (!willSendSms) return
  const { data: micro, error: microErr } = await db
    .from("document_templates").select("legal_review_status")
    .eq("scope", "system").eq("template_key", "notice.service_notification").eq("template_type", "sms").maybeSingle()
  logQueryError("assertNoticeApproved micro lookup", microErr)
  // Fail closed: a lookup error means we cannot confirm approval → block.
  if (microErr || micro?.legal_review_status !== "approved") {
    throw new NoticeGateError("notice.service_notification", micro?.legal_review_status ?? null)
  }
}

const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

/** The cpaApplies branch actually cited, recorded on the row for audit of the legal basis. */
function citationBranch(noticeType: DemandNoticeType, cpa: CpaAppliesState): string {
  if (noticeType === "demand_vacate_m2m") return "m2m:rha_s5_5"
  const scope = noticeType === "demand_vacate_breach" ? "breach" : "expiry"
  return `${scope}:${cpa === "yes" ? "cpa" : "contractual"}`
}

function buildElement(p: IssueTenantNoticeParams, vacateByDateDisplay: string, todaysDate: string): React.ReactElement {
  const { lease, recipient, branding, propertyLabel, referenceNumber, landlordOrAgentName } = p
  const common = {
    branding, tenantName: recipient.tenantName, serviceAddress: recipient.serviceAddress,
    propertyLabel, referenceNumber, landlordOrAgentName, vacateByDate: vacateByDateDisplay, todaysDate,
  }
  switch (lease.noticeType) {
    case "demand_vacate_breach":
      if (!lease.finalNoticeDate || !lease.cancellationEffectiveDate) throw new Error("breach notice requires finalNoticeDate + cancellationEffectiveDate")
      return React.createElement(DemandToVacateBreachEmail, {
        ...common, finalNoticeDate: lease.finalNoticeDate, cancellationEffectiveDate: lease.cancellationEffectiveDate, cpaApplies: lease.cpaApplies,
      })
    case "demand_vacate_expiry":
      if (!lease.leaseEndDate) throw new Error("expiry notice requires leaseEndDate")
      return React.createElement(DemandToVacateExpiryEmail, { ...common, leaseEndDate: lease.leaseEndDate, cpaApplies: lease.cpaApplies })
    case "demand_vacate_m2m":
      if (!lease.terminationNoticeDate || !lease.leaseEndDate) throw new Error("m2m notice requires terminationNoticeDate + leaseEndDate")
      return React.createElement(DemandToVacateM2mEmail, { ...common, terminationNoticeDate: lease.terminationNoticeDate, leaseEndDate: lease.leaseEndDate })
  }
}

interface FanOutCtx {
  db: Db
  orgId: string
  templateKey: string
  noticeId: string
  bodyFull: string
  subject: string
  dispatchedAt: string
  generatedBy: string | null
  recipient: IssueTenantNoticeParams["recipient"]
  sureties: NonNullable<IssueTenantNoticeParams["sureties"]>
}

/** Service-event note for an email dispatch (kept out of the send for SonarJS nested-ternary rule). */
function emailServiceNote(success: boolean, suretyCopy: boolean, error?: string): string | null {
  if (suretyCopy) return success ? "surety copy" : `surety copy failed: ${error ?? ""}`
  return success ? null : (error ?? "send failed")
}

/** Serve the full notice to one email + record the service event. `suretyCopy` marks a surety CC (E11). */
async function serveNoticeEmail(ctx: FanOutCtx, email: string, name: string, contactId: string | null | undefined, subject: string, suretyCopy: boolean): Promise<boolean> {
  const r = await sendEmail({
    orgId: ctx.orgId, templateKey: ctx.templateKey, to: { email, name, contactId: contactId ?? undefined },
    subject, rawHtml: ctx.bodyFull, entityType: "tenant_notice", entityId: ctx.noticeId,
    triggerEventType: "demand_to_vacate", triggerEventId: ctx.noticeId,
    tenantId: ctx.recipient.tenantId ?? undefined, toneVariant: "n/a", triggeredBy: ctx.generatedBy ?? undefined,
  }).catch((e) => ({ success: false, logId: undefined, error: e instanceof Error ? e.message : String(e) }))
  const note = emailServiceNote(r.success, suretyCopy, r.error)
  await recordNoticeServiceEvent(ctx.db, {
    orgId: ctx.orgId, noticeId: ctx.noticeId, channel: "email", serviceMethod: "electronic", address: email,
    status: r.success ? "dispatched" : "failed", dispatchedAt: ctx.dispatchedAt, providerEventId: r.logId ?? null, note,
  })
  return r.success
}

/** Serve the short notification-of-service micro-template to one phone + record the service event. */
async function serveNoticeSms(ctx: FanOutCtx, phone: string): Promise<boolean> {
  const r = await sendSMS(ctx.orgId, phone, renderServiceNotificationSms(), {
    templateKey: "notice.service_notification", contactId: ctx.recipient.contactId ?? undefined, recipientName: ctx.recipient.tenantName,
    entityType: "tenant_notice", entityId: ctx.noticeId, toneVariant: "n/a",
    triggerEventType: "demand_to_vacate", triggerEventId: ctx.noticeId,
  }).catch((e) => ({ sent: false, reason: e instanceof Error ? e.message : String(e) }) as { sent: boolean; reason?: string })
  await recordNoticeServiceEvent(ctx.db, {
    orgId: ctx.orgId, noticeId: ctx.noticeId, channel: "sms", serviceMethod: "electronic", address: phone,
    status: r.sent ? "dispatched" : "failed", dispatchedAt: ctx.dispatchedAt, note: r.sent ? null : (r.reason ?? "sms not sent"),
  })
  return r.sent
}

/** The escalated multi-channel/multi-address fan-out: every service email + every phone + each surety. */
async function runEscalatedFanOut(ctx: FanOutCtx): Promise<IssueTenantNoticeResult["dispatched"]> {
  const dispatched: IssueTenantNoticeResult["dispatched"] = []
  for (const email of Array.from(new Set(ctx.recipient.emails.filter(Boolean)))) {
    dispatched.push({ channel: "email", address: email, success: await serveNoticeEmail(ctx, email, ctx.recipient.tenantName, ctx.recipient.contactId, ctx.subject, false) })
  }
  for (const phone of Array.from(new Set((ctx.recipient.phones ?? []).filter(Boolean)))) {
    dispatched.push({ channel: "sms", address: phone, success: await serveNoticeSms(ctx, phone) })
  }
  for (const s of ctx.sureties) {
    if (!s.email) continue
    dispatched.push({ channel: "email", address: s.email, success: await serveNoticeEmail(ctx, s.email, s.name, s.contactId, `[Copy served on surety for information] ${ctx.subject}`, true) })
  }
  return dispatched
}

export interface RenderedDemandNotice {
  bodyFull: string
  contentHash: string
  vacateByDateISO: string
  vacateByDateDisplay: string
  todaysDate: string
  citationBranch: string
  mergeSnapshot: Record<string, unknown>
}

/**
 * Render a Demand to Vacate to its canonical body_full + hash + frozen dates. THE single render path (P-2):
 * both issueTenantNotice (before insert) and the preview action call this, so what an agent previews is
 * byte-identical to what gets issued. Pure — NO gate, NO DB writes. Legal dates are SAST (saTodayISO).
 */
export async function renderDemandNotice(params: IssueTenantNoticeParams): Promise<RenderedDemandNotice> {
  const { lease, recipient } = params
  const baseIso = saDateISO(params.now)
  const vacateByDateISO = computeVacateByDate(new Date(`${baseIso}T00:00:00.000Z`))
  const todaysDate = fmtDate(baseIso)
  const vacateByDateDisplay = fmtDate(vacateByDateISO)
  const bodyFull = await render(buildElement(params, vacateByDateDisplay, todaysDate))
  return {
    bodyFull,
    contentHash: createHash("sha256").update(bodyFull).digest("hex"),
    vacateByDateISO, vacateByDateDisplay, todaysDate,
    citationBranch: citationBranch(lease.noticeType, lease.cpaApplies),
    mergeSnapshot: {
      tenantName: recipient.tenantName, serviceAddress: recipient.serviceAddress, propertyLabel: params.propertyLabel,
      landlordOrAgentName: params.landlordOrAgentName, referenceNumber: params.referenceNumber,
      todaysDate, vacateByDate: vacateByDateDisplay, cpaApplies: lease.cpaApplies ?? null,
      finalNoticeDate: lease.finalNoticeDate ?? null, cancellationEffectiveDate: lease.cancellationEffectiveDate ?? null,
      leaseEndDate: lease.leaseEndDate ?? null, terminationNoticeDate: lease.terminationNoticeDate ?? null,
    },
  }
}

/**
 * Issue a Demand to Vacate. Creates the immutable notice-of-record, then serves it across every channel
 * and address. Returns the notice id + the dispatch outcomes. Throws NoticeGateError outside the allowlisted
 * dev/preview/test render environments when the notice (or, when SMS will send, the micro-template) is not
 * counsel-approved — fail-closed.
 */
export async function issueTenantNotice(params: IssueTenantNoticeParams): Promise<IssueTenantNoticeResult> {
  const { db, orgId, generatedBy, now, lease, recipient, sureties = [] } = params
  const templateKey = `notice.${lease.noticeType}`

  // ── Fail-closed draft-gate (R-1 / plan §0; polarity per CD Phase D walk) ─────────────────────────────
  const { data: tmpl, error: tmplErr } = await db
    .from("document_templates")
    .select("id, version, legal_review_status")
    .eq("scope", "system").eq("template_key", templateKey).eq("template_type", "letter")
    .maybeSingle()
  logQueryError("issueTenantNotice template lookup", tmplErr)
  await assertNoticeApproved(db, templateKey, tmpl?.legal_review_status, (recipient.phones ?? []).some(Boolean))

  // ── Render ONCE → body_full via the shared path (P-2); hash + every transmitted copy derive from it ───
  const { bodyFull, contentHash, vacateByDateISO, citationBranch: branch, mergeSnapshot } = await renderDemandNotice(params)

  // ── The immutable notice-of-record ────────────────────────────────────────────────────────────────
  const { data: notice, error: noticeErr } = await db
    .from("tenant_notices")
    .insert({
      org_id: orgId, lease_id: lease.id, notice_type: lease.noticeType,
      template_id: tmpl?.id ?? null, template_version: tmpl?.version ?? null, citation_branch: branch,
      body_full: bodyFull, content_hash: contentHash, merge_snapshot: mergeSnapshot,
      cancellation_effective_date: lease.cancellationEffectiveISO ?? null, vacate_by_date: vacateByDateISO,
      generated_by: generatedBy, manual_override: params.manualOverride ?? null,
    })
    .select("id").single()
  if (noticeErr || !notice) {
    logQueryError("issueTenantNotice insert tenant_notices", noticeErr)
    throw new Error(`failed to record notice-of-record: ${noticeErr?.message ?? "no row"}`)
  }
  const noticeId = notice.id as string

  // Issuance audit (R-9) — PII-SAFE: hash + type only, never body_full / recipient PII (RULE #7).
  await db.from("audit_log").insert({
    org_id: orgId, table_name: "tenant_notices", record_id: noticeId, action: "INSERT",
    new_values: { event: "demand_to_vacate_issued", notice_type: lease.noticeType, content_hash: contentHash, citation_branch: branch },
  })
  await db.from("lease_lifecycle_events").insert({
    org_id: orgId, lease_id: lease.id, event_type: "demand_to_vacate_issued",
    description: `Demand to Vacate issued (${lease.noticeType})`, metadata: { notice_id: noticeId, notice_type: lease.noticeType },
    triggered_by: "agent", triggered_by_user: generatedBy,
  })

  // ── Escalated fan-out — send to ALL; a bounce never silences (each is a logged service event) ───────
  const dispatched = await runEscalatedFanOut({
    db, orgId, templateKey, noticeId, bodyFull, generatedBy, recipient, sureties,
    subject: `${SUBJECTS[lease.noticeType]} — ${params.propertyLabel}`, dispatchedAt: now.toISOString(),
  })

  return { noticeId, vacateByDate: vacateByDateISO, dispatched }
}
