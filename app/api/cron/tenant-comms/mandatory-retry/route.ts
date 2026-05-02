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

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

async function fetchOriginalBody(
  service: ServiceClient,
  logId: string,
): Promise<{ rawHtml?: string; subject?: string }> {
  const { data, error } = await service
    .from("communication_log")
    .select("body_full, subject")
    .eq("id", logId)
    .single()
  if (error) {
    console.error("[mandatory-retry] Failed to fetch original log body:", error.message)
    return {}
  }
  return {
    rawHtml: (data?.body_full as string | null) ?? undefined,
    subject: (data?.subject as string | null) ?? undefined,
  }
}

async function sendFallbackAlert(retry: RetryRow): Promise<void> {
  const snap = retry.recipient_snapshot
  if (!(snap.email ?? snap.phone)) return
  await routeAndSend({
    orgId:             retry.org_id,
    templateKey:       "notice.delivery_fallback",
    tenantId:          snap.tenant_id,
    to: { email: snap.email ?? undefined, phone: snap.phone ?? undefined, name: "Tenant" },
    subject:           "Important notice — we tried to reach you",
    smsBody:           "Pleks: We tried to send you an important notice. Please check your email or contact your agent. pleks.co.za",
    triggerEventType:  "mandatory_retry",
    triggerEventId:    retry.communication_log_id ?? undefined,
    firstAttemptLogId: retry.communication_log_id ?? undefined,
  })
}

async function settleRetry(
  service: ServiceClient,
  retryId: string,
  newAttemptCount: number,
  failureReason: string | undefined,
): Promise<"surrendered" | "advanced"> {
  if (newAttemptCount >= MAX_ATTEMPTS) {
    await service.from("mandatory_comm_retries").update({
      surrendered_at:      new Date().toISOString(),
      surrender_reason:    "cascade_exhausted",
      last_failure_reason: failureReason ?? null,
      updated_at:          new Date().toISOString(),
    }).eq("id", retryId)
    return "surrendered"
  }
  await service.from("mandatory_comm_retries").update({
    attempt_count:       newAttemptCount,
    next_attempt_at:     nextAttemptAt(newAttemptCount),
    last_failure_reason: failureReason ?? null,
    updated_at:          new Date().toISOString(),
  }).eq("id", retryId)
  return "advanced"
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()

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

    // Delivery-alert side channel fires at attempt 3 (the penultimate attempt)
    if (retry.attempt_count === 3) {
      await sendFallbackAlert(retry)
    }

    // Fetch stored body_full for replay — stored precisely for this purpose (BUILD_63 §8)
    const { rawHtml, subject: origSubject } = retry.communication_log_id
      ? await fetchOriginalBody(service, retry.communication_log_id)
      : {}

    const result = await routeAndSend({
      orgId:             retry.org_id,
      templateKey:       retry.template_key,
      tenantId:          snap.tenant_id,
      to: { email: snap.email ?? undefined, phone: snap.phone ?? undefined, name: "Tenant" },
      subject:           origSubject ?? "Important notice (retry)",
      rawHtml,
      toneVariant:       snap.tone_variant as "friendly" | "professional" | "firm" | "n/a",
      triggerEventType:  "mandatory_retry",
      triggerEventId:    retry.communication_log_id ?? undefined,
      attemptNumber:     newAttemptCount,
      firstAttemptLogId: retry.communication_log_id ?? undefined,
    })

    if (result.success) {
      await service.from("mandatory_comm_retries").delete().eq("id", retry.id)
      processed++
      continue
    }

    const outcome = await settleRetry(service, retry.id, newAttemptCount, result.error)
    if (outcome === "surrendered") surrendered++
  }

  return NextResponse.json({ processed, surrendered, total: retries.length })
}
