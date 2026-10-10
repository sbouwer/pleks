/**
 * lib/comms/recordNoticePageView.ts — record a page_view delivery event when a public notice page renders
 *
 * Auth:   none of its own — its only caller is the server page app/(public)/public/notice/[token]/page.tsx,
 *         which has already resolved the token row. Deliberately NOT a "use server" module: as an exported
 *         action it let anyone stamp a page_view (evidence read by the legal comm export) on any row id.
 * Data:   delivery_notice_tokens (read by id), communication_delivery_events (insert) via service client
 */
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, requireEnv } from "@/lib/env"

export async function recordNoticePageView(tokenId: string): Promise<void> {
  const service = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"))
  // Org + comm-log come FROM the token row, never from the caller.
  const { data: row, error: rowErr } = await service
    .from("delivery_notice_tokens")
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- token-scoped: the page resolved this row from the unguessable token; the org is read from the row, there is no caller org to scope by
    .select("org_id, communication_log_id")
    .eq("id", tokenId)
    .maybeSingle()
  if (rowErr) { console.error("[delivery-notice] page-view token lookup failed:", rowErr.message); return }
  if (!row) return

  await service.from("communication_delivery_events").insert({
    org_id:               row.org_id,
    communication_log_id: row.communication_log_id,
    event_type:           "page_view",
    provider:             "pleks_portal",
    occurred_at:          new Date().toISOString(),
    raw_payload:          { source: "notice_page_view", token_id: tokenId },
  })
}
