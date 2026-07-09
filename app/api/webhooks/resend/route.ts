/**
 * app/api/webhooks/resend/route.ts — Resend delivery event receiver
 *
 * Route:  POST /api/webhooks/resend
 * Auth:   Svix signature (RESEND_WEBHOOK_SECRET env var) — rejects without it
 * Data:   writes communication_delivery_events; updates communication_log status;
 *         marks hard bounces in communication_preferences (BUILD_63); bridges served-notice outcomes
 *         into notice_service_events (LEG-NOTICES-01 Phase D)
 * Notes:  Returns 200 for events we don't care about to prevent Resend retries.
 *         RESEND_WEBHOOK_SECRET must match the signing secret from Resend dashboard.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { bridgeNoticeDelivery } from "@/lib/notices/bridgeNoticeDelivery"

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET

interface ResendWebhookPayload {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.complained"
    | "email.bounced"
    | "email.opened"
    | "email.clicked"
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    bounce?: { type: "permanent" | "transient" }
  }
}

async function verifyResendSignature(req: NextRequest, body: string): Promise<boolean> {
  if (!RESEND_WEBHOOK_SECRET) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not configured")
    return false
  }
  const svixId        = req.headers.get("svix-id")
  const svixTimestamp = req.headers.get("svix-timestamp")
  const svixSignature = req.headers.get("svix-signature")
  if (!svixId || !svixTimestamp || !svixSignature) return false
  try {
    const { Webhook } = await import("svix")
    const wh = new Webhook(RESEND_WEBHOOK_SECRET)
    wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    })
    return true
  } catch {
    return false
  }
}

const EVENT_TYPE_MAP: Record<string, string> = {
  "email.sent":             "sent",
  "email.delivered":        "delivered",
  "email.opened":           "opened",
  "email.clicked":          "clicked",
  "email.bounced":          "bounced_hard",
  "email.delivery_delayed": "bounced_soft",
  "email.complained":       "complained",
}

const STATUS_MAP: Record<string, string> = {
  "email.delivered": "delivered",
  "email.opened":    "opened",
  "email.clicked":   "opened",
  "email.bounced":   "bounced",
  "email.complained":"unsubscribed",
}

function resolveEventType(payload: ResendWebhookPayload): string | null {
  const raw = EVENT_TYPE_MAP[payload.type]
  if (!raw) return null
  if (raw === "bounced_hard" && payload.data.bounce?.type === "transient") return "bounced_soft"
  return raw
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>
type LogRecord = { id: string; sent_to_email: string | null; org_id: string }

async function applyPreferenceSideEffects(
  service: ServiceClient,
  logRecord: LogRecord,
  payload: ResendWebhookPayload,
) {
  if (!logRecord.sent_to_email) return
  const email = logRecord.sent_to_email

  if (payload.type === "email.bounced" && payload.data.bounce?.type === "permanent") {
    await service.from("communication_preferences").upsert(
      { org_id: logRecord.org_id, email, email_hard_bounced: true, email_hard_bounced_at: payload.created_at, updated_at: new Date().toISOString() },
      { onConflict: "org_id,email" },
    )
  } else if (payload.type === "email.complained") {
    await service.from("communication_preferences").upsert(
      { org_id: logRecord.org_id, email, unsubscribed_at: payload.created_at, updated_at: new Date().toISOString() },
      { onConflict: "org_id,email" },
    )
  }
}

async function updateLogStatus(service: ServiceClient, logId: string, payload: ResendWebhookPayload) {
  const newStatus = STATUS_MAP[payload.type]
  if (!newStatus) return
  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === "delivered") updates.delivered_at = payload.created_at
  if (newStatus === "opened")    updates.opened_at    = payload.created_at
  await service.from("communication_log").update(updates).eq("id", logId)
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  const isValid = await verifyResendSignature(req, body)
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })

  let payload: ResendWebhookPayload
  try {
    payload = JSON.parse(body) as ResendWebhookPayload
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: logRecord, error: logErr } = await service
    .from("communication_log")
    .select("id, sent_to_email, org_id, entity_type, entity_id, channel")
    .eq("external_id", payload.data.email_id)
    .maybeSingle()

  if (logErr) {
    console.error("[resend-webhook] DB lookup error:", logErr.message)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
  if (!logRecord) return NextResponse.json({ ok: true })

  const eventType = resolveEventType(payload)
  if (!eventType) return NextResponse.json({ ok: true })

  const { error: insertErr } = await service.from("communication_delivery_events").insert({
    org_id:               logRecord.org_id,
    communication_log_id: logRecord.id,
    event_type:           eventType,
    provider:             "resend",
    provider_event_id:    payload.data.email_id + ":" + payload.type,
    occurred_at:          payload.created_at,
    raw_payload:          payload as unknown as Record<string, unknown>,
  })
  if (insertErr && insertErr.code !== "23505") {
    console.error("[resend-webhook] Failed to insert delivery event:", insertErr.message)
  }

  // LEG-NOTICES-01 Phase D — if this log is a served Demand-to-Vacate, append its notice_service_events
  // row (deemed-service anchor on 'delivered'). No-op for any other comm. Fail-safe (never throws).
  await bridgeNoticeDelivery(service, logRecord, eventType, payload.created_at, payload.data.email_id + ":" + payload.type)

  await Promise.all([
    updateLogStatus(service, logRecord.id, payload),
    applyPreferenceSideEffects(service, logRecord, payload),
  ])

  return NextResponse.json({ ok: true })
}
