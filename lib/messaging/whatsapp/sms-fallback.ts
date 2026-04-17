import { sendSMS } from "@/lib/sms/sendSMS"
import { createServiceClient } from "@/lib/supabase/server"

const SUFFIX = "... pleks.co.za"
const MAX_SMS_LENGTH = 160

// ── Text helpers ───────────────────────────────────────────────────────────────

/**
 * Strips WhatsApp-style *bold* and _italic_ markers, then truncates to 160 chars
 * with a "... pleks.co.za" suffix if needed.
 */
export function deriveSmsFromWhatsApp(body: string): string {
  const stripped = body
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")

  if (stripped.length <= MAX_SMS_LENGTH) return stripped

  const cutoff = MAX_SMS_LENGTH - SUFFIX.length
  return stripped.slice(0, cutoff) + SUFFIX
}

// ── Fallback sender ────────────────────────────────────────────────────────────

export async function sendSmsFallback(
  whatsappMessageId: string,
  orgId: string,
  toPhone: string,
  whatsappBody: string,
): Promise<void> {
  const smsBody = deriveSmsFromWhatsApp(whatsappBody)

  const result = await sendSMS(orgId, toPhone, smsBody)

  if (!result.sent && result.skipped) {
    console.warn("[sms-fallback] SMS skipped:", result.reason)
    return
  }

  const db = await createServiceClient()

  // Update whatsapp_messages.sms_fallback_sent_at
  const { error: updateErr } = await db
    .from("whatsapp_messages")
    .update({ sms_fallback_sent_at: new Date().toISOString() })
    .eq("id", whatsappMessageId)

  if (updateErr) {
    console.error("[sms-fallback] update whatsapp_messages error", updateErr)
  }

  // Log to communication_log
  const { error: logErr } = await db
    .from("communication_log")
    .insert({
      org_id: orgId,
      channel: "sms",
      direction: "outbound",
      subject: "SMS fallback from WhatsApp",
      body: smsBody,
      status: result.sent ? "sent" : "failed",
      sent_to_phone: toPhone,
    })

  if (logErr) {
    console.error("[sms-fallback] communication_log insert error", logErr)
  }
}
