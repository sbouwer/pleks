/**
 * Email composition + dispatch for property info requests.
 *
 * BUILD_60 Phase 20 — ships React Email components for all 8 topics
 * (initial + reminder) plus the two internal notifications. Replaces the
 * Phase 13 inline-HTML fallback.
 *
 * Tone selection
 *   - Initials always ship a single friendly-professional voice. Tenant-
 *     facing comms use the full friendly/professional/firm tone spread;
 *     owner/broker/scheme info-request initials do not. See BUILD_60 /
 *     ADDENDUM_57E notes on tone_owner.
 *   - Reminders have two firmness variants (polite, firm). The selection
 *     is derived here from (a) the org's tone_owner preference, and
 *     (b) the reminder_count on the info-request row — first reminders
 *     skew polite, later reminders skew firm.
 */

import type { ReactElement } from "react"

import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { createServiceClient } from "@/lib/supabase/server"

import { LandlordInfoRequestEmail } from "@/lib/comms/templates/info-requests/landlord"
import { LandlordInfoRequestReminder } from "@/lib/comms/templates/info-requests/landlord-reminder"
import { InsuranceInfoRequestEmail } from "@/lib/comms/templates/info-requests/insurance"
import { InsuranceInfoRequestReminder } from "@/lib/comms/templates/info-requests/insurance-reminder"
import { BrokerInfoRequestEmail } from "@/lib/comms/templates/info-requests/broker"
import { BrokerInfoRequestReminder } from "@/lib/comms/templates/info-requests/broker-reminder"
import { SchemeInfoRequestEmail } from "@/lib/comms/templates/info-requests/scheme"
import { SchemeInfoRequestReminder } from "@/lib/comms/templates/info-requests/scheme-reminder"
import { BankingInfoRequestEmail } from "@/lib/comms/templates/info-requests/banking"
import { BankingInfoRequestReminder } from "@/lib/comms/templates/info-requests/banking-reminder"
import { DocumentsInfoRequestEmail } from "@/lib/comms/templates/info-requests/documents"
import { DocumentsInfoRequestReminder } from "@/lib/comms/templates/info-requests/documents-reminder"
import { ComplianceInfoRequestEmail } from "@/lib/comms/templates/info-requests/compliance"
import { ComplianceInfoRequestReminder } from "@/lib/comms/templates/info-requests/compliance-reminder"
import { OtherInfoRequestEmail } from "@/lib/comms/templates/info-requests/other"
import { OtherInfoRequestReminder } from "@/lib/comms/templates/info-requests/other-reminder"
import { InfoRequestCompletionNotify } from "@/lib/comms/templates/info-requests/completion-notify"
import { InfoRequestSelfTrackNudge } from "@/lib/comms/templates/info-requests/self-track-nudge"

// ── Types ─────────────────────────────────────────────────────────────────────

export type InfoRequestTopic =
  | "landlord" | "insurance" | "broker" | "scheme"
  | "banking"  | "documents" | "compliance" | "other"

export type InsuranceRecipient = "owner" | "broker"

export interface SendInfoRequestParams {
  orgId:          string
  requestId:      string
  topic:          InfoRequestTopic
  recipientEmail: string
  token:          string
  propertyId:     string
  isReminder?:    boolean
  /**
   * 0 for initial; 1 for first reminder; 2+ for later reminders.
   * Used alongside org tone_owner preference to pick polite vs firm.
   */
  reminderCount?: number
  /** Only consulted when topic='insurance'. Defaults to 'owner'. */
  insuranceRecipient?: InsuranceRecipient
  /** Free-form prompt for topic='other'; carried through to the template. */
  prompt?: string
  /** If known at send time, used in broker/scheme openings. */
  ownerName?: string
  /** If known at send time, used in scheme openings. */
  schemeName?: string
}

export interface SendResult {
  ok:    boolean
  logId?: string
  error?: string
}

// ── Topic labels (used in log preview + completion_notify / self_track) ──────

export const TOPIC_LABELS: Record<InfoRequestTopic, string> = {
  landlord:   "Owner details",
  insurance:  "Insurance details",
  broker:     "Broker details",
  scheme:     "Managing scheme contact",
  banking:    "Banking details",
  documents:  "Property documents",
  compliance: "Compliance certificates",
  other:      "Property information",
}

// ── Org tone preference helper ───────────────────────────────────────────────

type OwnerTone = "friendly" | "professional" | "firm"

async function fetchOwnerTone(orgId: string): Promise<OwnerTone> {
  const service = await createServiceClient()
  const { data } = await service
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single()

  const settings = (data?.settings ?? {}) as { preferences?: { tone_owner?: OwnerTone } }
  const tone = settings.preferences?.tone_owner
  if (tone === "friendly" || tone === "professional" || tone === "firm") return tone
  return "professional"
}

/**
 * Tone selection matrix for reminders.
 *
 *                 reminderCount=1     reminderCount=2+
 *   friendly      polite              polite
 *   professional  polite              firm
 *   firm          firm                firm
 *
 * Initials always ship a single voice regardless of tone_owner (see module
 * header). reminderCount=0 is treated as "initial" upstream and should not
 * reach this function.
 */
function pickFirmness(tone: OwnerTone, reminderCount: number): "polite" | "firm" {
  if (tone === "firm") return "firm"
  if (tone === "friendly") return "polite"
  return reminderCount >= 2 ? "firm" : "polite"
}

// ── Property label resolver ──────────────────────────────────────────────────

async function fetchPropertyLabel(propertyId: string): Promise<string> {
  const service = await createServiceClient()
  const { data } = await service
    .from("properties")
    .select("name, address_line1, suburb, city")
    .eq("id", propertyId)
    .single()

  if (!data) return "your property"
  const parts = [
    data.name as string | null,
    [data.address_line1, data.suburb ?? data.city].filter(Boolean).join(", "),
  ].filter(Boolean)

  // Prefer "Name — Address" when both are known; fall back to whichever exists
  if (parts.length === 2) return `${parts[0]} — ${parts[1]}`
  return parts[0] ?? "your property"
}

// ── Email element selection ──────────────────────────────────────────────────

interface RenderContext {
  branding:        ReturnType<typeof buildBranding>
  propertyLabel:   string
  secureUrl:       string
  firmness:        "polite" | "firm"
  insuranceRecipient: InsuranceRecipient
  prompt?:         string
  ownerName?:      string
  schemeName?:     string
}

type TemplateResult = { element: ReactElement; templateKey: string; subject: string }

function selectInitialTemplate(topic: InfoRequestTopic, ctx: RenderContext): TemplateResult {
  const { branding, propertyLabel: p, secureUrl, insuranceRecipient, prompt, ownerName, schemeName } = ctx
  switch (topic) {
    case "landlord":   return { templateKey: "info_request.landlord",   subject: `Confirm the owner details for ${p}`,                      element: <LandlordInfoRequestEmail   branding={branding} propertyLabel={p} secureUrl={secureUrl} /> }
    case "insurance":  return { templateKey: "info_request.insurance",  subject: `Confirm insurance details for ${p}`,                      element: <InsuranceInfoRequestEmail  branding={branding} propertyLabel={p} secureUrl={secureUrl} recipientType={insuranceRecipient} ownerName={ownerName} /> }
    case "broker":     return { templateKey: "info_request.broker",     subject: `Coverage confirmation requested for ${p}`,                element: <BrokerInfoRequestEmail     branding={branding} propertyLabel={p} secureUrl={secureUrl} ownerName={ownerName} /> }
    case "scheme":     return { templateKey: "info_request.scheme",     subject: `Scheme contact details requested for ${p}`,               element: <SchemeInfoRequestEmail     branding={branding} propertyLabel={p} secureUrl={secureUrl} schemeName={schemeName} /> }
    case "banking":    return { templateKey: "info_request.banking",    subject: `Confirm banking details for owner statements on ${p}`,    element: <BankingInfoRequestEmail    branding={branding} propertyLabel={p} secureUrl={secureUrl} /> }
    case "documents":  return { templateKey: "info_request.documents",  subject: `Upload a few property documents for ${p}`,                element: <DocumentsInfoRequestEmail  branding={branding} propertyLabel={p} secureUrl={secureUrl} /> }
    case "compliance": return { templateKey: "info_request.compliance", subject: `Compliance certificate details for ${p}`,                 element: <ComplianceInfoRequestEmail branding={branding} propertyLabel={p} secureUrl={secureUrl} /> }
    case "other":      return { templateKey: "info_request.other",      subject: `Information requested for ${p}`,                          element: <OtherInfoRequestEmail      branding={branding} propertyLabel={p} secureUrl={secureUrl} prompt={prompt} /> }
  }
}

function selectReminderTemplate(topic: InfoRequestTopic, ctx: RenderContext): TemplateResult {
  const { branding, propertyLabel: p, secureUrl, firmness, insuranceRecipient, prompt } = ctx
  const action  = firmness === "firm" ? "Action needed"  : "Quick reminder"
  const followUp = firmness === "firm" ? "Follow-up required" : "Following up"
  switch (topic) {
    case "landlord":   return { templateKey: "info_request.landlord_reminder",   subject: `${action} — owner details for ${p}`,              element: <LandlordInfoRequestReminder   branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} /> }
    case "insurance":  return { templateKey: "info_request.insurance_reminder",  subject: `${action} — insurance details for ${p}`,          element: <InsuranceInfoRequestReminder  branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} recipientType={insuranceRecipient} /> }
    case "broker":     return { templateKey: "info_request.broker_reminder",     subject: `${followUp} — coverage confirmation for ${p}`,    element: <BrokerInfoRequestReminder     branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} /> }
    case "scheme":     return { templateKey: "info_request.scheme_reminder",     subject: `${followUp} — scheme contact details for ${p}`,   element: <SchemeInfoRequestReminder     branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} /> }
    case "banking":    return { templateKey: "info_request.banking_reminder",    subject: `${action} — banking details for ${p}`,            element: <BankingInfoRequestReminder    branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} /> }
    case "documents":  return { templateKey: "info_request.documents_reminder",  subject: `${action} — documents for ${p}`,                  element: <DocumentsInfoRequestReminder  branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} /> }
    case "compliance": return { templateKey: "info_request.compliance_reminder", subject: `${action} — compliance details for ${p}`,         element: <ComplianceInfoRequestReminder branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} /> }
    case "other":      return { templateKey: "info_request.other_reminder",      subject: `${action} — information for ${p}`,                element: <OtherInfoRequestReminder      branding={branding} propertyLabel={p} secureUrl={secureUrl} firmness={firmness} prompt={prompt} /> }
  }
}

function selectTemplate(topic: InfoRequestTopic, isReminder: boolean, ctx: RenderContext): TemplateResult {
  if (isReminder) return selectReminderTemplate(topic, ctx)
  return selectInitialTemplate(topic, ctx)
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function sendInfoRequestEmail(params: SendInfoRequestParams): Promise<SendResult> {
  const isReminder = params.isReminder ?? false
  const reminderCount = params.reminderCount ?? (isReminder ? 1 : 0)

  // Parallel fetches: org settings, tone preference, property label
  const [orgSettings, tone, propertyLabel] = await Promise.all([
    fetchOrgSettings(params.orgId),
    fetchOwnerTone(params.orgId),
    fetchPropertyLabel(params.propertyId),
  ])

  const branding = buildBranding(orgSettings)
  const firmness = pickFirmness(tone, reminderCount)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://pleks.co.za"
  const secureUrl = `${baseUrl}/property-info/${params.token}`

  const ctx: RenderContext = {
    branding,
    propertyLabel,
    secureUrl,
    firmness,
    insuranceRecipient: params.insuranceRecipient ?? "owner",
    prompt:     params.prompt,
    ownerName:  params.ownerName,
    schemeName: params.schemeName,
  }

  const { element, templateKey, subject } = selectTemplate(params.topic, isReminder, ctx)

  const result = await sendEmail({
    orgId:        params.orgId,
    templateKey,
    to:           { email: params.recipientEmail, name: params.recipientEmail },
    subject,
    emailElement: element,
    bodyPreview:  `${branding.orgName} — ${TOPIC_LABELS[params.topic]} — ${secureUrl}`,
    entityType:   "property_info_request",
    entityId:     params.requestId,
  })

  return {
    ok:    result.success,
    logId: result.logId,
    error: result.error,
  }
}

// ── Internal notification helpers ────────────────────────────────────────────

export interface SendCompletionNotifyParams {
  orgId:             string
  requestId:         string
  topic:             InfoRequestTopic
  recipientEmail:    string
  propertyId:        string
  submitterDisplay:  string
}

/**
 * Called by the public info-request submit action once the owner / broker
 * / scheme has posted their response. Notifies the agency user who initiated
 * the request that the reply has landed.
 */
export async function sendInfoRequestCompletionNotify(
  params: SendCompletionNotifyParams,
): Promise<SendResult> {
  const [orgSettings, propertyLabel] = await Promise.all([
    fetchOrgSettings(params.orgId),
    fetchPropertyLabel(params.propertyId),
  ])

  const branding = buildBranding(orgSettings)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://pleks.co.za"
  const propertyUrl = `${baseUrl}/properties/${params.propertyId}?tab=overview`

  const topicLabel = TOPIC_LABELS[params.topic]

  const element = (
    <InfoRequestCompletionNotify
      branding={branding}
      propertyLabel={propertyLabel}
      propertyUrl={propertyUrl}
      topicLabel={topicLabel}
      submitterDisplay={params.submitterDisplay}
    />
  )

  const result = await sendEmail({
    orgId:        params.orgId,
    templateKey:  "info_request.completion_notify",
    to:           { email: params.recipientEmail, name: params.recipientEmail },
    subject:      `Reply received — ${topicLabel.toLowerCase()} for ${propertyLabel}`,
    emailElement: element,
    bodyPreview:  `${params.submitterDisplay} replied to ${topicLabel} on ${propertyLabel}`,
    entityType:   "property_info_request",
    entityId:     params.requestId,
  })

  return { ok: result.success, logId: result.logId, error: result.error }
}

export interface SendSelfTrackNudgeParams {
  orgId:          string
  requestId:      string
  topic:          InfoRequestTopic
  recipientEmail: string
  propertyId:     string
  daysElapsed?:   number
}

/**
 * Called by the property-info-requests cron at T+30 days for self-track
 * rows. Reminds the agency user that they committed to following up
 * themselves on an outstanding topic.
 */
export async function sendInfoRequestSelfTrackNudge(
  params: SendSelfTrackNudgeParams,
): Promise<SendResult> {
  const [orgSettings, propertyLabel] = await Promise.all([
    fetchOrgSettings(params.orgId),
    fetchPropertyLabel(params.propertyId),
  ])

  const branding = buildBranding(orgSettings)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://pleks.co.za"
  const propertyUrl = `${baseUrl}/properties/${params.propertyId}?tab=overview`

  const topicLabel = TOPIC_LABELS[params.topic]

  const element = (
    <InfoRequestSelfTrackNudge
      branding={branding}
      propertyLabel={propertyLabel}
      propertyUrl={propertyUrl}
      topicLabel={topicLabel}
      daysElapsed={params.daysElapsed ?? 30}
    />
  )

  const result = await sendEmail({
    orgId:        params.orgId,
    templateKey:  "info_request.self_track_nudge",
    to:           { email: params.recipientEmail, name: params.recipientEmail },
    subject:      `Still outstanding — ${topicLabel.toLowerCase()} on ${propertyLabel}`,
    emailElement: element,
    bodyPreview:  `${branding.orgName} — ${topicLabel} outstanding on ${propertyLabel}`,
    entityType:   "property_info_request",
    entityId:     params.requestId,
  })

  return { ok: result.success, logId: result.logId, error: result.error }
}
