/**
 * lib/comms/delivery-notice-tokens.ts — create delivery-alert notice tokens
 *
 * Data:   delivery_notice_tokens via service client
 * Notes:  Called from mandatory-retry cron when the delivery-alert side channel
 *         fires. The generated URL is included in the SMS/WhatsApp fallback body.
 *         Tokens expire at the mandatory deadline (template-specific) or 30 days.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { APP_URL } from "@/lib/env"

const DEADLINE_DAYS: Record<string, number> = {
  "deposit.return_schedule":   21,
  "deposit.returned":          21,
  "inspection.dispute_window":  7,
  "lease.renewal_notice":      30,
  "lease.expiry_reminder":     30,
  "lease.terminated":          30,
  "arrears.letter_of_demand":  14,
  "arrears.final_notice":       7,
}

function deadlineDays(templateKey: string): number {
  return DEADLINE_DAYS[templateKey] ?? 30
}

export async function createDeliveryNoticeToken(
  service: SupabaseClient,
  opts: {
    orgId:             string
    communicationLogId: string
    tenantId:          string | null
    templateKey:       string
  },
): Promise<string | null> {
  const days = deadlineDays(opts.templateKey)
  const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString()

  const { data, error } = await service
    .from("delivery_notice_tokens")
    .insert({
      org_id:               opts.orgId,
      communication_log_id: opts.communicationLogId,
      tenant_id:            opts.tenantId ?? null,
      expires_at:           expiresAt,
    })
    .select("token")
    .single()

  if (error) {
    console.error("[delivery-notice-tokens] insert failed:", error.message)
    return null
  }

  const appUrl = APP_URL
  return `${appUrl}/public/notice/${data.token}`
}
