/**
 * app/api/webhooks/africastalking/delivery/route.ts — Africa's Talking SMS delivery reports
 *
 * Route:  POST /api/webhooks/africastalking/delivery
 * Auth:   AT account username (form field, constant-time vs AT_WEBHOOK_USERNAME) AND, when configured,
 *         a shared-secret header (x-at-webhook-secret vs AT_WEBHOOK_SECRET). The header is env-gated: it
 *         is enforced only once AT_WEBHOOK_SECRET is set, so it can be rolled out without breaking live
 *         callbacks. Deemed-service legality does NOT rest on this webhook — see bridgeNoticeDelivery M-4.
 * Data:   writes communication_delivery_events keyed by provider messageId (BUILD_63); bridges served-notice
 *         SMS outcomes into notice_service_events (LEG-NOTICES-01 Phase D)
 * Notes:  AT sends delivery reports as x-www-form-urlencoded, not JSON.
 *         Duplicate deliveries are silently ignored via UNIQUE(provider, provider_event_id).
 */

import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { bridgeNoticeDelivery } from "@/lib/notices/bridgeNoticeDelivery"
import { optionalEnv } from "@/lib/env"

export const runtime = "nodejs"

const AT_USERNAME = optionalEnv("AT_WEBHOOK_USERNAME")
const AT_SECRET = optionalEnv("AT_WEBHOOK_SECRET")

/** Constant-time string compare (no timing side-channel). */
function secretEquals(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Inbound auth: the AT account username (always) plus, when AT_WEBHOOK_SECRET is configured, a matching
 * x-at-webhook-secret header (M-4 defence-in-depth). Env-gating the header keeps the check dark until the
 * secret is provisioned on the AT dashboard, so it can be rolled out without dropping live delivery reports.
 */
function requestIsAuthentic(req: NextRequest, username: string | null): boolean {
  if (!secretEquals(username, AT_USERNAME)) return false
  if (AT_SECRET && !secretEquals(req.headers.get("x-at-webhook-secret"), AT_SECRET)) return false
  return true
}

interface ATDeliveryReport {
  id:         string   // AT message ID
  status:     string   // "Success" | "Failed" | "Buffered" | "Sent" | "Rejected"
  phoneNumber:string
  networkCode:string
  failureReason?: string
  retryCount?:    string
}

function mapAtStatus(status: string): string | null {
  switch (status) {
    case "Success":  return "delivered"
    case "Sent":     return "sent"
    case "Buffered": return "queued"
    case "Failed":   return "failed"
    case "Rejected": return "bounced_hard"
    default:         return null
  }
}

type ATService = Awaited<ReturnType<typeof createServiceClient>>

// Process one delivery report: record the delivery event, bridge served-notice outcomes, update log status.
async function handleDeliveryItem(service: ATService, item: ATDeliveryReport): Promise<void> {
  const eventType = mapAtStatus(item.status)
  if (!eventType) return

  // Match against communication_log by external_id (AT message ID stored at send time)
  const { data: logRecord, error: logRecordError } = await service
    .from("communication_log")
    .select("id, org_id, entity_type, entity_id, channel, sent_to_phone")
    .eq("external_id", item.id)
    .maybeSingle()
  logQueryError("POST communication_log", logRecordError)
  if (!logRecord) return

  const occurredAt = new Date().toISOString()
  const { error } = await service.from("communication_delivery_events").insert({
    org_id:               logRecord.org_id,
    communication_log_id: logRecord.id,
    event_type:           eventType,
    provider:             "africastalking_sms",
    provider_event_id:    item.id,
    occurred_at:          occurredAt,
    raw_payload:          item as unknown as Record<string, unknown>,
  })
  if (error && error.code !== "23505") {
    console.error("[at-delivery] Insert error:", error.message)
  }

  // LEG-NOTICES-01 Phase D — bridge a served-notice SMS outcome into notice_service_events. Fail-safe.
  await bridgeNoticeDelivery(service, logRecord, eventType, occurredAt, item.id)

  if (eventType === "delivered" || eventType === "failed") {
    await service
      .from("communication_log")
      .update({ status: eventType === "delivered" ? "delivered" : "failed" })
      .eq("id", logRecord.id)
  }
}

export async function POST(req: NextRequest) {
  // Africa's Talking passes username as a form field for basic auth
  const form = await req.formData()
  const username = form.get("username") as string | null

  if (!requestIsAuthentic(req, username)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const reports = form.get("deliveryReport")
  if (!reports) return NextResponse.json({ ok: true })

  let parsed: { responses?: ATDeliveryReport[] }
  try {
    parsed = JSON.parse(reports as string) as { responses?: ATDeliveryReport[] }
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 })
  }

  const items = parsed.responses ?? []
  if (items.length === 0) return NextResponse.json({ ok: true })

  const service = await createServiceClient()

  for (const item of items) {
    await handleDeliveryItem(service, item)
  }

  return NextResponse.json({ ok: true })
}
