"use server"

/**
 * lib/actions/delivery-notice.ts — acknowledge a delivery-alert notice token
 *
 * Auth:   public (no session required — anonymous notice page)
 * Data:   delivery_notice_tokens, communication_delivery_events via service client
 * Notes:  Stamps acknowledged_at on the token and records an acknowledgement event. Called from the
 *         public /public/notice/[token] page. The page_view recorder is lib/comms/recordNoticePageView.ts —
 *         not here, because it has no token check and every export of this module is an endpoint.
 */

import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, requireEnv } from "@/lib/env"

function getService() {
  return createClient(
    SUPABASE_URL,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  )
}

export async function acknowledgeNotice(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const service = getService()

  const { data: row, error: fetchError } = await service
    .from("delivery_notice_tokens")
    .select("id, org_id, communication_log_id, expires_at, acknowledged_at")
    .eq("token", token)
    .maybeSingle()

  if (fetchError || !row) return { success: false, error: "Token not found" }
  if (new Date(row.expires_at) < new Date()) return { success: false, error: "Token expired" }
  if (row.acknowledged_at) return { success: true }  // idempotent

  const now = new Date().toISOString()

  const [{ error: ackError }, { error: evtError }] = await Promise.all([
    service
      .from("delivery_notice_tokens")
      // eslint-disable-next-line pleks/require-org-scope-on-service-write -- token-scoped: row.id resolves from delivery_notice_tokens via the unguessable token (validated + unexpired above); the token is the credential, no caller-org exists
      .update({ acknowledged_at: now })
      .eq("id", row.id),
    service
      .from("communication_delivery_events")
      .insert({
        org_id:               row.org_id,
        communication_log_id: row.communication_log_id,
        event_type:           "page_view",
        provider:             "pleks_portal",
        occurred_at:          now,
        raw_payload:          { source: "notice_acknowledge", token_id: row.id },
      }),
  ])

  if (ackError) {
    console.error("[delivery-notice] acknowledge update failed:", ackError.message)
    return { success: false, error: ackError.message }
  }
  if (evtError) {
    console.error("[delivery-notice] delivery event insert failed:", evtError.message)
  }

  return { success: true }
}
