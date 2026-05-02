/**
 * app/api/cron/tenant-comms/mandatory-retry/route.ts — drains mandatory_comm_retries queue
 *
 * Route:  POST /api/cron/tenant-comms/mandatory-retry
 * Auth:   CRON_SECRET header
 * Data:   mandatory_comm_retries, communication_log, router (service client)
 * Notes:  Ideal cadence is every 6h (Vercel Pro). On free tier add to daily cron instead.
 *         Cascade: T+1h → T+6h → T+24h → T+72h; after attempt 4 marks surrendered.
 *         Attempt count ≥ 3 inserts a delivery_fallback side-channel send before retry 4.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { routeAndSend } from "@/lib/messaging/router"

const CRON_SECRET = process.env.CRON_SECRET
const MAX_ATTEMPTS = 4

// Offset hours for each attempt after the first
const NEXT_ATTEMPT_HOURS = [1, 6, 24, 72]

function nextAttemptAt(attemptCount: number): string | null {
  const hours = NEXT_ATTEMPT_HOURS[attemptCount] // attemptCount is 1-based after increment
  if (!hours) return null
  return new Date(Date.now() + hours * 3600 * 1000).toISOString()
}

interface RetryRow {
  id: string
  org_id: string
  communication_log_id: string | null
  template_key: string
  attempt_count: number
  recipient_snapshot: {
    tenant_id: string
    email: string | null
    phone: string | null
    channels_tried: string[]
    tone_variant: string
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()

  // Fetch due rows
  const { data: rows, error } = await service
    .from("mandatory_comm_retries")
    .select("id, org_id, communication_log_id, template_key, attempt_count, recipient_snapshot")
    .lte("next_attempt_at", new Date().toISOString())
    .is("surrendered_at", null)
    .order("next_attempt_at")
    .limit(50)

  if (error) {
    console.error("[mandatory-retry] Fetch error:", error.message)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  const retries = (rows ?? []) as RetryRow[]
  let processed = 0, surrendered = 0

  for (const retry of retries) {
    const snap = retry.recipient_snapshot
    const newAttemptCount = retry.attempt_count + 1

    // Deliver-alert side channel at attempt 3 (before the final retry)
    if (retry.attempt_count === 3 && (snap.email ?? snap.phone)) {
      await routeAndSend({
        orgId:              retry.org_id,
        templateKey:        "notice.delivery_fallback",
        tenantId:           snap.tenant_id,
        to: { email: snap.email ?? undefined, phone: snap.phone ?? undefined, name: "Tenant" },
        subject:            "Important notice — we tried to reach you",
        smsBody:            "Pleks: We tried to send you an important notice. Please check your email or contact your agent. pleks.co.za",
        triggerEventType:   "mandatory_retry",
        triggerEventId:     retry.communication_log_id ?? undefined,
        firstAttemptLogId:  retry.communication_log_id ?? undefined,
      })
    }

    // Attempt the retry send
    const result = await routeAndSend({
      orgId:             retry.org_id,
      templateKey:       retry.template_key,
      tenantId:          snap.tenant_id,
      to: { email: snap.email ?? undefined, phone: snap.phone ?? undefined, name: "Tenant" },
      subject:           "Important notice (retry)",
      toneVariant:       snap.tone_variant as "friendly" | "professional" | "firm" | "n/a",
      triggerEventType:  "mandatory_retry",
      triggerEventId:    retry.communication_log_id ?? undefined,
      attemptNumber:     newAttemptCount,
      firstAttemptLogId: retry.communication_log_id ?? undefined,
    })

    if (result.success) {
      // Success — remove from queue
      await service.from("mandatory_comm_retries").delete().eq("id", retry.id)
      processed++
      continue
    }

    // Failure — surrender after max attempts, otherwise advance
    if (newAttemptCount >= MAX_ATTEMPTS) {
      await service.from("mandatory_comm_retries").update({
        surrendered_at:     new Date().toISOString(),
        surrender_reason:   "cascade_exhausted",
        last_failure_reason: result.error ?? null,
        updated_at:         new Date().toISOString(),
      }).eq("id", retry.id)
      surrendered++
    } else {
      const next = nextAttemptAt(newAttemptCount)
      await service.from("mandatory_comm_retries").update({
        attempt_count:       newAttemptCount,
        next_attempt_at:     next,
        last_failure_reason: result.error ?? null,
        updated_at:          new Date().toISOString(),
      }).eq("id", retry.id)
    }
  }

  return NextResponse.json({ processed, surrendered, total: retries.length })
}
