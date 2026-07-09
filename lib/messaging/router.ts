/**
 * lib/messaging/router.ts — channel router: single choke point for all tenant-facing comms
 *
 * Data:   sendEmail, sendSMS, sendWhatsApp, mandatory_comm_retries (service client), frequency limiter
 * Notes:  Channel priority is driven by template allowed_channels (whitelist + priority order).
 *         WhatsApp fires first when allowed_channels includes it and the template supplies
 *         a whatsappTemplate param — falls through to SMS, then email on skip/failure.
 *         Tier gates live inside each sender (sendSMS, sendWhatsApp); the router just cascades.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, type SendEmailParams } from "@/lib/comms/send-email"
import { canSend } from "@/lib/comms/preferences"
import { sendSMS } from "@/lib/sms/sendSMS"
import { sendWhatsApp, type WhatsAppTemplate } from "@/lib/whatsapp/sendWhatsApp"
import { getTemplate } from "@/lib/comms/template-registry"
import { checkFrequencyLimit } from "./frequency"
import type { ReactElement } from "react"

// ── Channel priority ──────────────────────────────────────────────────────────
// When a template has allowed_channels, that list is both the whitelist AND the priority
// order; implemented channels are tried in sequence (whatsapp → sms → email).
// Without allowed_channels, fall back to tone_profile default below.
const IMPLEMENTED_CHANNELS = new Set<string>(["email", "sms", "whatsapp"])

type ChannelName = "email" | "sms" | "whatsapp"

const CHANNEL_PRIORITY_DEFAULT: Record<string, ChannelName[]> = {
  transactional: ["email"],
  relational:    ["email", "sms"],
  legal:         ["email"],
}

export interface RouteAndSendParams {
  orgId: string
  templateKey: string
  tenantId: string
  to: {
    email?: string
    phone?: string
    name: string
    contactId?: string
  }
  subject: string
  emailElement?: ReactElement
  rawHtml?: string
  /** BUILD_70 Phase 2b — opt-in {{token}} → value map; routes a non-statutory send through the org's
   *  Customised correspondence template when one exists (else unchanged). */
  mergeValues?: Record<string, string>
  smsBody?: string
  whatsappTemplate?: WhatsAppTemplate
  bodyPreview?: string
  entityType?: string
  entityId?: string
  triggeredBy?: string
  toneVariant?: "friendly" | "professional" | "firm" | "n/a"
  triggerEventType?: string
  triggerEventId?: string
  attemptNumber?: number
  firstAttemptLogId?: string
  templateCategory?: string
}

export interface RouteAndSendResult {
  success: boolean
  channel?: ChannelName
  logId?: string
  queued?: boolean   // true if added to mandatory_comm_retries
  error?: string
}

export async function routeAndSend(params: RouteAndSendParams): Promise<RouteAndSendResult> {
  const template = getTemplate(params.templateKey)

  // Frequency check — mandatory templates bypass
  if (!template.is_mandatory) {
    const freq = await checkFrequencyLimit(params.tenantId, params.templateKey)
    if (!freq.allowed) {
      return { success: false, error: freq.reason }
    }
  }

  // Resolve channel list:
  // - If template defines allowed_channels, filter to implemented channels preserving order.
  // - Otherwise fall back to tone_profile default priority.
  const toneProfile = template.tone_profile ?? "transactional"
  const allowed = template.allowed_channels

  const channels: ChannelName[] = allowed
    ? (allowed as string[]).filter((c): c is ChannelName => IMPLEMENTED_CHANNELS.has(c))
    : (CHANNEL_PRIORITY_DEFAULT[toneProfile] ?? ["email"])

  let lastError: string | undefined
  let lastLogId: string | undefined

  for (const channel of channels) {
    const attempt = await dispatchChannel(channel, params, template.is_mandatory)
    if (attempt.success) return { success: true, channel, logId: attempt.logId }
    lastError = attempt.error
    lastLogId = attempt.logId
  }

  // All channels failed — queue mandatory retry if applicable
  if (template.is_mandatory) {
    const queued = await queueMandatoryRetry(params, lastError, lastLogId)
    return { success: false, queued, error: lastError }
  }

  return { success: false, error: lastError }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function dispatchChannel(
  channel: ChannelName,
  params: RouteAndSendParams,
  isMandatory: boolean,
): Promise<{ success: boolean; logId?: string; error?: string }> {
  // Email opt-out is enforced inside sendEmail's own canSend. SMS + WhatsApp had NO opt-out gate
  // (M-3): a hard-bounce/unsubscribe/category opt-out only blocked the email leg, so a cascade
  // fell through and delivered on SMS/WhatsApp anyway. Gate the phone legs here (non-mandatory
  // only — mandatory notices are never suppressed) so a skip falls through to the next channel.
  if (channel !== "email" && !isMandatory) {
    const pref = await canSend({
      orgId:       params.orgId,
      templateKey: params.templateKey,
      email:       params.to.email,
      contactId:   params.to.contactId,
      channel:     "sms",
    })
    if (!pref.allowed) return { success: false, error: `${channel}_skipped:${pref.reason}` }
  }

  if (channel === "whatsapp") return attemptWhatsApp(params)
  if (channel === "sms") return attemptSms(params)
  return attemptEmail(params, isMandatory)
}

async function attemptWhatsApp(
  params: RouteAndSendParams,
): Promise<{ success: boolean; logId?: string; error?: string }> {
  if (!params.to.phone) return { success: false, error: "no_phone_number" }
  if (!params.whatsappTemplate) return { success: false, error: "no_whatsapp_template" }

  const result = await sendWhatsApp(params.orgId, params.to.phone, params.whatsappTemplate, {
    templateKey:       params.templateKey,
    contactId:         params.to.contactId,
    recipientName:     params.to.name,
    entityType:        params.entityType,
    entityId:          params.entityId,
    toneVariant:       params.toneVariant,
    triggerEventType:  params.triggerEventType,
    triggerEventId:    params.triggerEventId,
    attemptNumber:     params.attemptNumber,
    firstAttemptLogId: params.firstAttemptLogId,
  })
  if (result.sent) return { success: true, logId: result.logId }
  if (result.skipped) return { success: false, error: `whatsapp_skipped:${result.reason}`, logId: result.logId }
  return { success: false, error: result.reason ?? "whatsapp_failed", logId: result.logId }
}

async function attemptEmail(
  params: RouteAndSendParams,
  _isMandatory: boolean,
): Promise<{ success: boolean; logId?: string; error?: string }> {
  if (!params.to.email) return { success: false, error: "no_email_address" }

  const emailParams: SendEmailParams = {
    orgId: params.orgId,
    templateKey: params.templateKey,
    tenantId: params.tenantId,
    to: {
      email: params.to.email,
      name: params.to.name,
      contactId: params.to.contactId,
    },
    subject: params.subject,
    emailElement: params.emailElement,
    rawHtml: params.rawHtml,
    mergeValues: params.mergeValues,
    bodyPreview: params.bodyPreview,
    entityType: params.entityType,
    entityId: params.entityId,
    triggeredBy: params.triggeredBy,
    toneVariant: params.toneVariant,
    triggerEventType: params.triggerEventType,
    triggerEventId: params.triggerEventId,
    attemptNumber: params.attemptNumber,
    firstAttemptLogId: params.firstAttemptLogId,
    templateCategory: params.templateCategory,
  }

  return sendEmail(emailParams)
}

async function attemptSms(
  params: RouteAndSendParams,
): Promise<{ success: boolean; logId?: string; error?: string }> {
  if (!params.to.phone) return { success: false, error: "no_phone_number" }
  if (!params.smsBody) return { success: false, error: "no_sms_body" }

  const result = await sendSMS(params.orgId, params.to.phone, params.smsBody, {
    templateKey:       params.templateKey,
    contactId:         params.to.contactId,
    recipientName:     params.to.name,
    entityType:        params.entityType,
    entityId:          params.entityId,
    toneVariant:       params.toneVariant,
    triggerEventType:  params.triggerEventType,
    triggerEventId:    params.triggerEventId,
    attemptNumber:     params.attemptNumber,
    firstAttemptLogId: params.firstAttemptLogId,
  })
  if (result.sent) return { success: true, logId: result.logId }
  if (result.skipped) return { success: false, error: `sms_skipped:${result.reason}`, logId: result.logId }
  return { success: false, error: result.reason ?? "sms_failed", logId: result.logId }
}

async function queueMandatoryRetry(
  params: RouteAndSendParams,
  failureReason: string | undefined,
  failedLogId: string | undefined,
): Promise<boolean> {
  try {
    const service = await createServiceClient()
    const nextAttempt = new Date(Date.now() + 60 * 60 * 1000) // T+1h

    const { error } = await service.from("mandatory_comm_retries").insert({
      org_id: params.orgId,
      communication_log_id: failedLogId ?? params.firstAttemptLogId ?? null,
      template_key: params.templateKey,
      recipient_snapshot: {
        tenant_id: params.tenantId,
        email: params.to.email ?? null,
        phone: params.to.phone ?? null,
        channels_tried: ["email"],
        tone_variant: params.toneVariant ?? "n/a",
      },
      attempt_count: params.attemptNumber ?? 1,
      next_attempt_at: nextAttempt.toISOString(),
      last_failure_reason: failureReason ?? null,
    })

    if (error) {
      console.error("[router] Failed to queue mandatory retry:", error.message)
      return false
    }
    return true
  } catch (err) {
    console.error("[router] Unexpected error queueing retry:", err)
    return false
  }
}
