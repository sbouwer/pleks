/**
 * lib/whatsapp/sendWhatsApp.ts — router-compatible WhatsApp sender via Africa's Talking
 *
 * Auth:   internal — called by router.ts; tier gate enforced inside
 * Data:   Africa's Talking WhatsApp API (Steward+ only), communication_log (service client)
 * Notes:  Mirrors sendSMS.ts structure and return shape exactly so the router can treat
 *         WhatsApp as a drop-in third channel. Complex cases (consent gates, CS windows,
 *         quota tracking) are handled by lib/messaging/whatsapp/send.ts — this module is
 *         the thin send-path used by the router for cron-driven template sends.
 *         Tier gate: whatsapp_notifications feature requires Steward+.
 */
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { createServiceClient } from "@/lib/supabase/server"
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp/provider"

export interface WhatsAppTemplate {
  name:          string     // pre-approved Meta template name, e.g. "inspection_reminder_v1"
  parameters:    string[]   // positional fill for {{1}}..{{N}} placeholders
  language_code?: string    // default "en" — set at template registration, not at send time
}

export interface WhatsAppAuditParams {
  templateKey?:       string
  contactId?:         string
  recipientName?:     string
  entityType?:        string
  entityId?:          string
  toneVariant?:       "friendly" | "professional" | "firm" | "n/a"
  triggerEventType?:  string
  triggerEventId?:    string
  attemptNumber?:     number
  firstAttemptLogId?: string
}

export interface WhatsAppResult {
  sent:     boolean
  skipped?: boolean
  reason?:  string
  logId?:   string
}

export async function sendWhatsApp(
  orgId:    string,
  to:       string,
  template: WhatsAppTemplate,
  audit?:   WhatsAppAuditParams,
): Promise<WhatsAppResult> {
  // Tier gate — WhatsApp requires Steward+ (whatsapp_notifications feature)
  const tier = await getOrgTier(orgId)
  if (!hasFeature(tier, "whatsapp_notifications")) {
    const service = await createServiceClient()
    const { data: log } = await service.from("communication_log").insert({
      org_id:       orgId,
      channel:      "whatsapp",
      direction:    "outbound",
      subject:      audit?.templateKey ?? template.name,
      body:         `[template:${template.name}]`,
      status:       "logged",
      sent_to_phone: to,
      template_key: audit?.templateKey ?? null,
    }).select("id").single()
    return { sent: false, skipped: true, reason: "WhatsApp not available on Owner tier", logId: log?.id ?? undefined }
  }

  const service = await createServiceClient()

  const sharedLogFields = {
    org_id:               orgId,
    channel:              "whatsapp" as const,
    direction:            "outbound" as const,
    subject:              audit?.templateKey ?? template.name,
    body:                 `[template:${template.name}]`,
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

  const sendResult = await sendWhatsAppMessage({
    to,
    templateName: template.name,
    parameters:   template.parameters,
    orgId,
  })

  if (sendResult.error) {
    const { data: log } = await service.from("communication_log").insert({
      ...sharedLogFields,
      status:        "failed",
      failed_reason: sendResult.error,
    }).select("id").single()
    return { sent: false, reason: sendResult.error, logId: log?.id ?? undefined }
  }

  const { data: log } = await service.from("communication_log").insert({
    ...sharedLogFields,
    status:      "sent",
    external_id: sendResult.messageId ?? null,
  }).select("id").single()

  return { sent: true, logId: log?.id ?? undefined }
}
