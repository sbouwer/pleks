/**
 * lib/messaging/router.ts — channel router: single choke point for all tenant-facing comms
 *
 * Data:   sendEmail, sendSMS, mandatory_comm_retries (service client), frequency limiter
 * Notes:  WhatsApp routing is Phase 2 — router currently handles email + SMS only.
 *         Channel priority is driven by template tone_profile (transactional/relational/legal).
 *         Fails-open on frequency DB error; mandatory templates bypass frequency limits.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, type SendEmailParams } from "@/lib/comms/send-email"
import { sendSMS } from "@/lib/sms/sendSMS"
import { getTemplate } from "@/lib/comms/template-registry"
import { checkFrequencyLimit } from "./frequency"
import type { ReactElement } from "react"

// ── Channel priority by tone_profile ─────────────────────────────────────────
// Phase 1: email + SMS only. WhatsApp slots are reserved for Phase 3 of the router.
// When a template has allowed_channels defined, that list IS the priority order —
// implemented channels are used in the order they appear (e.g. ["whatsapp","sms","email"]
// becomes ["sms","email"] once whatsapp slots in). Without allowed_channels, fall back to
// tone_profile default below.
const IMPLEMENTED_CHANNELS = new Set<string>(["email", "sms"])

const CHANNEL_PRIORITY_DEFAULT: Record<string, Array<"email" | "sms">> = {
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
  smsBody?: string
  bodyPreview?: string
  entityType?: string
  entityId?: string
  triggeredBy?: string
  toneVariant?: "friendly" | "professional" | "firm" | "n/a"
  triggerEventType?: string
  triggerEventId?: string
  attemptNumber?: number
  firstAttemptLogId?: string
}

export interface RouteAndSendResult {
  success: boolean
  channel?: "email" | "sms"
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
  // - If template defines allowed_channels, that list is both the whitelist AND the priority
  //   order; we just filter out unimplemented channels (WhatsApp → Phase 3).
  // - Otherwise fall back to the tone_profile default priority.
  const toneProfile = template.tone_profile ?? "transactional"
  const allowed = template.allowed_channels

  const channels: Array<"email" | "sms"> = allowed
    ? (allowed as string[]).filter((c): c is "email" | "sms" => IMPLEMENTED_CHANNELS.has(c))
    : (CHANNEL_PRIORITY_DEFAULT[toneProfile] ?? ["email"])

  let lastError: string | undefined
  let lastLogId: string | undefined

  for (const channel of channels) {
    if (channel === "email") {
      const result = await attemptEmail(params, template.is_mandatory)
      if (result.success) return { success: true, channel: "email", logId: result.logId }
      lastError = result.error
      lastLogId = result.logId
    } else if (channel === "sms") {
      const result = await attemptSms(params)
      if (result.success) return { success: true, channel: "sms", logId: result.logId }
      lastError = result.error
      lastLogId = result.logId
    }
  }

  // All channels failed — queue mandatory retry if applicable
  if (template.is_mandatory) {
    const queued = await queueMandatoryRetry(params, lastError, lastLogId)
    return { success: false, queued, error: lastError }
  }

  return { success: false, error: lastError }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function attemptEmail(
  params: RouteAndSendParams,
  _isMandatory: boolean,
): Promise<{ success: boolean; logId?: string; error?: string }> {
  if (!params.to.email) return { success: false, error: "no_email_address" }

  const emailParams: SendEmailParams = {
    orgId: params.orgId,
    templateKey: params.templateKey,
    to: {
      email: params.to.email,
      name: params.to.name,
      contactId: params.to.contactId,
    },
    subject: params.subject,
    emailElement: params.emailElement,
    rawHtml: params.rawHtml,
    bodyPreview: params.bodyPreview,
    entityType: params.entityType,
    entityId: params.entityId,
    triggeredBy: params.triggeredBy,
    toneVariant: params.toneVariant,
    triggerEventType: params.triggerEventType,
    triggerEventId: params.triggerEventId,
    attemptNumber: params.attemptNumber,
    firstAttemptLogId: params.firstAttemptLogId,
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
