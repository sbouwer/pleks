/**
 * lib/notices/bridgeNoticeDelivery.ts — route notice delivery outcomes into notice_service_events
 *
 * Notes:  LEG-NOTICES-01 Phase D. The delivery webhooks (Resend, Africa's Talking) already look up the
 *         communication_log row by external_id and write a communication_delivery_events row. This bridge
 *         adds: when that log row is a served notice (entity_type='tenant_notice'), APPEND a
 *         notice_service_events row (one per outcome — never an UPDATE, the table is immutable). A
 *         'delivered' event is the deemed-service anchor (R-2): it carries deemed_service_at and triggers
 *         the ≥7-calendar-day floor post-validation, flagging a short vacate period for re-issue (surfaced
 *         to the agent in slice E). Fail-safe: any error here is logged, never thrown — it must not break
 *         the webhook's 200 to the provider.
 */

import type { createServiceClient } from "@/lib/supabase/server"
import { recordNoticeServiceEvent } from "./recordServiceEvent"
import { deemedServiceMeetsFloor } from "./vacateDate"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

type Db = Awaited<ReturnType<typeof createServiceClient>>

/** The subset of a communication_log row the bridge needs. */
export interface NoticeCommLogRow {
  org_id: string
  entity_type: string | null
  entity_id: string | null
  channel: string | null
  sent_to_email?: string | null
  sent_to_phone?: string | null
}

/** Map a communication_delivery_events event_type → a notice service status (null = not service-relevant). */
function noticeStatusFor(eventType: string): "delivered" | "bounced" | "failed" | null {
  if (eventType === "delivered") return "delivered"
  if (eventType === "bounced_hard" || eventType === "bounced_soft") return "bounced"
  if (eventType === "failed") return "failed"
  return null  // queued/sent/opened/clicked/etc. — dispatch already logged the 'dispatched' row
}

/** communication_log.channel → the notice_service_events channel (email is the catch-all). */
function noticeChannel(logChannel: string | null | undefined): "email" | "sms" | "whatsapp" {
  if (logChannel === "sms") return "sms"
  if (logChannel === "whatsapp") return "whatsapp"
  return "email"
}

/**
 * If `log` is a served Demand-to-Vacate, append the matching notice_service_events row. No-op for any
 * other communication_log row, so it is safe to call unconditionally from every delivery webhook.
 */
export async function bridgeNoticeDelivery(
  db: Db, log: NoticeCommLogRow, eventType: string, occurredAt: string, providerEventId: string | null,
): Promise<void> {
  try {
    if (log.entity_type !== "tenant_notice" || !log.entity_id) return
    const status = noticeStatusFor(eventType)
    if (!status) return

    const channel = noticeChannel(log.channel)

    // M-4: ONLY an email 'delivered' event is the legal deemed-service anchor. SMS/WhatsApp delivery
    // reports arrive via the Africa's Talking webhook, whose inbound auth (AT account username in a
    // form field) is weaker than a forgery-proof anchor demands. A phone 'delivered' is still APPENDED
    // as a corroborating service event, but with deemed_service_at = null — it cannot, on its own,
    // manufacture the ≥7-calendar-day vacate floor. Email (Resend, signature-verified) stays primary.
    const isDeemedServiceAnchor = status === "delivered" && channel === "email"
    const deemedServiceAt = isDeemedServiceAnchor ? occurredAt : null

    await recordNoticeServiceEvent(db, {
      orgId: log.org_id, noticeId: log.entity_id, channel, serviceMethod: "electronic",
      address: log.sent_to_email ?? log.sent_to_phone ?? null, status, deemedServiceAt, providerEventId,
    })

    // R-2 post-validation runs only on a real deemed-service anchor (email delivered).
    if (isDeemedServiceAnchor) {
      const { data: notice, error } = await db
        .from("tenant_notices").select("vacate_by_date").eq("id", log.entity_id).maybeSingle()
      logQueryError("bridgeNoticeDelivery notice lookup", error)
      if (notice?.vacate_by_date && !deemedServiceMeetsFloor(notice.vacate_by_date as string, new Date(occurredAt))) {
        await recordAudit(db, { orgId: log.org_id, table: "tenant_notices", recordId: log.entity_id, action: "NOTE", after: { event: "notice_service_short", reason: "deemed_service_to_vacate_below_floor", vacate_by_date: notice.vacate_by_date } })
      }
    }
  } catch (e) {
    console.error("[bridgeNoticeDelivery] non-fatal:", e instanceof Error ? e.message : String(e))
  }
}
