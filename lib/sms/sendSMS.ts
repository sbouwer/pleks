/**
 * lib/sms/sendSMS.ts — Africa's Talking SMS sender with communication_log audit trail
 *
 * Auth:   internal — called by router.ts; tier gate enforced inside
 * Data:   Africa's Talking API (Steward+ only), communication_log (service client)
 * Notes:  Parses AT response for messageId and logs every send (success + failure) to
 *         communication_log so delivery webhooks and frequency limiter can track SMS.
 *         Tier gate: sms_notifications feature requires Steward+.
 */
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface SMSAuditParams {
  templateKey?: string
  contactId?: string
  recipientName?: string
  entityType?: string
  entityId?: string
  toneVariant?: "friendly" | "professional" | "firm" | "n/a"
  triggerEventType?: string
  triggerEventId?: string
  attemptNumber?: number
  firstAttemptLogId?: string
}

export interface SMSResult {
  sent: boolean
  skipped?: boolean
  reason?: string
  logId?: string
}

interface ATResponse {
  SMSMessageData?: {
    Recipients?: Array<{ messageId: string; status: string }>
  }
}

export async function sendSMS(
  orgId: string,
  to: string,
  message: string,
  audit?: SMSAuditParams
): Promise<SMSResult> {
  // Tier gate — SMS requires Steward+ (sms_notifications feature)
  const tier = await getOrgTier(orgId)
  if (!hasFeature(tier, "sms_notifications")) {
    const service = await createServiceClient()
    const { data: log, error: logError } = await service.from("communication_log").insert({
      org_id: orgId,
      channel: "sms",
      direction: "outbound",
      subject: audit?.templateKey ?? "sms",
      body: message.slice(0, 200),
      status: "logged",
      sent_to_phone: to,
      template_key: audit?.templateKey ?? null,
    }).select("id").single()
    logQueryError("sendSMS communication_log", logError)
    return { sent: false, skipped: true, reason: "SMS not available on Owner tier", logId: log?.id ?? undefined }
  }

  // Check AT credentials
  const apiKey = process.env.AT_API_KEY
  const username = process.env.AT_USERNAME
  if (!apiKey || !username) {
    return { sent: false, reason: "Africa's Talking credentials not configured" }
  }

  const service = await createServiceClient()

  const sharedLogFields = {
    org_id:               orgId,
    channel:              "sms" as const,
    direction:            "outbound" as const,
    subject:              audit?.templateKey ?? "sms",
    body:                 message.slice(0, 200),
    sent_to_phone:        to,
    template_key:         audit?.templateKey ?? null,
    contact_id:           audit?.contactId ?? null,
    recipient_name:       audit?.recipientName ?? null,
    entity_type:          audit?.entityType ?? null,
    entity_id:            audit?.entityId ?? null,
    tone_variant:         audit?.toneVariant ?? null,
    trigger_event_type:   audit?.triggerEventType ?? null,
    trigger_event_id:     audit?.triggerEventId ?? null,
    attempt_number:       audit?.attemptNumber ?? 1,
    first_attempt_log_id: audit?.firstAttemptLogId ?? null,
  }

  try {
    const response = await fetch(
      username === "sandbox"
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey,
        },
        body: new URLSearchParams({
          username,
          to,
          message,
          from: "", // use default sender ID
        }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      const reason = `AT API error: ${response.status} ${text}`
      const { data: log, error: logError2 } = await service.from("communication_log").insert({
        ...sharedLogFields,
        status: "failed",
        failed_reason: reason,
      }).select("id").single()
        logQueryError("sendSMS communication_log", logError2)
      return { sent: false, reason, logId: log?.id ?? undefined }
    }

    const body = await response.json() as ATResponse
    const messageId = body.SMSMessageData?.Recipients?.[0]?.messageId ?? null

    const { data: log, error: logError3 } = await service.from("communication_log").insert({
      ...sharedLogFields,
      status: "sent",
      external_id: messageId,
    }).select("id").single()
    logQueryError("sendSMS communication_log", logError3)

    return { sent: true, logId: log?.id ?? undefined }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "SMS send failed"
    const { data: log, error: logError4 } = await service.from("communication_log").insert({
      ...sharedLogFields,
      status: "failed",
      failed_reason: reason,
    }).select("id").single()
    logQueryError("sendSMS communication_log", logError4)
    return { sent: false, reason, logId: log?.id ?? undefined }
  }
}
