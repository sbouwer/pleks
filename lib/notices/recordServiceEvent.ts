/**
 * lib/notices/recordServiceEvent.ts — append a row to the notice_service_events log (Rule 13)
 *
 * Notes:  notice_service_events is APPEND-ONLY (immutability trigger, 011 §25) — one row per OUTCOME, never
 *         an UPDATE. Dispatch writes a 'dispatched' row per channel/address; the delivery webhooks append a
 *         separate 'delivered' (carrying deemed_service_at) or 'bounced'/'failed' row. This helper is the
 *         single insert path so both callers stay consistent. Bounce never silences service — it is logged
 *         and (in the escalated fan-out) additional channels still carry the notice.
 */

import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

type Db = Awaited<ReturnType<typeof createServiceClient>>

export type NoticeServiceChannel =
  | "email" | "sms" | "whatsapp" | "physical" | "hand" | "sheriff" | "registered_post" | "other"
export type NoticeServiceMethod = "electronic" | "manual_attested"
export type NoticeServiceStatus = "dispatched" | "delivered" | "bounced" | "attested" | "failed"

export interface NoticeServiceEventInput {
  orgId: string
  noticeId: string
  channel: NoticeServiceChannel
  status: NoticeServiceStatus
  serviceMethod?: NoticeServiceMethod
  address?: string | null
  dispatchedAt?: string | null
  deemedServiceAt?: string | null
  providerEventId?: string | null
  attestedBy?: string | null
  proofPath?: string | null
  note?: string | null
}

/** Insert one append-only service-event row. Errors are logged, not thrown — a service-log write must
 *  never take down the dispatch or the webhook (the send/delivery is the primary fact). */
export async function recordNoticeServiceEvent(db: Db, p: NoticeServiceEventInput): Promise<void> {
  const { error } = await db.from("notice_service_events").insert({
    org_id: p.orgId,
    notice_id: p.noticeId,
    channel: p.channel,
    status: p.status,
    service_method: p.serviceMethod ?? null,
    address: p.address ?? null,
    dispatched_at: p.dispatchedAt ?? null,
    deemed_service_at: p.deemedServiceAt ?? null,
    provider_event_id: p.providerEventId ?? null,
    attested_by: p.attestedBy ?? null,
    proof_path: p.proofPath ?? null,
    note: p.note ?? null,
  })
  logQueryError("recordNoticeServiceEvent", error)
}
