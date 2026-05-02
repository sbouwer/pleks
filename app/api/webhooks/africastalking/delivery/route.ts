/**
 * app/api/webhooks/africastalking/delivery/route.ts — Africa's Talking SMS delivery reports
 *
 * Route:  POST /api/webhooks/africastalking/delivery
 * Auth:   username + API key header validation (AT_WEBHOOK_USERNAME env var)
 * Data:   writes communication_delivery_events keyed by provider messageId (BUILD_63)
 * Notes:  AT sends delivery reports as x-www-form-urlencoded, not JSON.
 *         Duplicate deliveries are silently ignored via UNIQUE(provider, provider_event_id).
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

const AT_USERNAME = process.env.AT_WEBHOOK_USERNAME

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

export async function POST(req: NextRequest) {
  // Africa's Talking passes username as a form field for basic auth
  const form = await req.formData()
  const username = form.get("username") as string | null

  if (!AT_USERNAME || username !== AT_USERNAME) {
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
    const eventType = mapAtStatus(item.status)
    if (!eventType) continue

    // Match against communication_log by external_id (AT message ID stored at send time)
    const { data: logRecord } = await service
      .from("communication_log")
      .select("id, org_id")
      .eq("external_id", item.id)
      .maybeSingle()

    if (!logRecord) continue

    const { error } = await service.from("communication_delivery_events").insert({
      org_id:               logRecord.org_id,
      communication_log_id: logRecord.id,
      event_type:           eventType,
      provider:             "africastalking_sms",
      provider_event_id:    item.id,
      occurred_at:          new Date().toISOString(),
      raw_payload:          item as unknown as Record<string, unknown>,
    })

    if (error && error.code !== "23505") {
      console.error("[at-delivery] Insert error:", error.message)
    }

    if (eventType === "delivered" || eventType === "failed") {
      await service
        .from("communication_log")
        .update({ status: eventType === "delivered" ? "delivered" : "failed" })
        .eq("id", logRecord.id)
    }
  }

  return NextResponse.json({ ok: true })
}
