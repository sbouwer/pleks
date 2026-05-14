/**
 * lib/sms/sendConsentSMS.ts — Consent-verification SMS sender (no tier gate)
 *
 * Auth:   internal — called by /api/consent/send-code only
 * Data:   Africa's Talking SMS API
 * Notes:  ADDENDUM_14F. Consent verification SMS is a platform obligation, not a
 *         tier-gated feature. Bypasses the sms_notifications tier gate in sendSMS.ts.
 *         Still logs to communication_log for audit completeness.
 */

import { createServiceClient } from "@/lib/supabase/server"

interface ATResponse {
  SMSMessageData?: {
    Recipients?: Array<{ messageId: string; status: string }>
  }
}

export interface ConsentSMSResult {
  sent: boolean
  reason?: string
}

export async function sendConsentSMS(
  to: string,
  message: string,
  orgId: string | null,
  entityId: string,
): Promise<ConsentSMSResult> {
  const apiKey = process.env.AT_API_KEY
  const username = process.env.AT_USERNAME

  if (!apiKey || !username) {
    return { sent: false, reason: "Africa's Talking credentials not configured" }
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
        body: new URLSearchParams({ username, to, message, from: "" }),
      }
    )

    const body = await response.json() as ATResponse
    const messageId = body.SMSMessageData?.Recipients?.[0]?.messageId ?? null

    const service = await createServiceClient()
    await service.from("communication_log").insert({
      org_id:             orgId,
      channel:            "sms",
      direction:          "outbound",
      subject:            "consent.verification",
      body:               message.slice(0, 200),
      status:             response.ok ? "sent" : "failed",
      sent_to_phone:      to,
      template_key:       "consent.verification",
      entity_type:        "consent_verification",
      entity_id:          entityId,
      external_id:        messageId,
      trigger_event_type: "consent_verification",
      trigger_event_id:   entityId,
    })

    return response.ok ? { sent: true } : { sent: false, reason: `AT error: ${response.status}` }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "SMS send failed" }
  }
}
