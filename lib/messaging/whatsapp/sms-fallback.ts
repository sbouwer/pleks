/**
 * lib/messaging/whatsapp/sms-fallback.ts — SMS fallback for WhatsApp messages that can't send
 *
 * Data:   Africa's Talking SMS API via sendSMS, communication_log (service client)
 * Notes:  Strips WhatsApp markdown (*bold*, _italic_) before sending.
 *         Truncates to 160 GSM-7 chars with "... pleks.co.za" suffix.
 *         Called by sendWhatsApp when WhatsApp eligibility fails and SMS is permitted.
 */
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
    .replaceAll(/\*([^*\n]+)\*/g, "$1")
    .replaceAll(/_([^_\n]+)_/g, "$1")
    .trim()

  if (stripped.length <= MAX_SMS_LENGTH) return stripped

  // Truncate on a word boundary so a legal claim (e.g. "proceedings in 5 business days") is not
  // severed mid-word (O-16 R4). Fall back to a hard slice only if there's no space to break on.
  const cutoff = MAX_SMS_LENGTH - SUFFIX.length
  const hardSlice = stripped.slice(0, cutoff)
  const lastSpace = hardSlice.lastIndexOf(" ")
  const safe = lastSpace > cutoff * 0.6 ? hardSlice.slice(0, lastSpace) : hardSlice
  return safe.trimEnd() + SUFFIX
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
    .eq("org_id", orgId) // org-scope guard (caller-ID census)

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
