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
import { optionalEnv } from "@/lib/env"
import * as Sentry from "@sentry/nextjs"

const RESEND_WEBHOOK_SECRET = optionalEnv("RESEND_WEBHOOK_SECRET")

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

/**
 * Every table holding a DELIVERABLE CREDENTIAL TOKEN. ADDENDUM_62F §17.1.
 *
 * Enumerated by capability, not by table — the third time this arc has needed that rule (§18.5,
 * §20.1). A new credential-token table adds `communication_log_id` and one line here, and the
 * enumeration test in `__tests__` fails until it does. `contact_change_requests` joins when
 * §15.2(b) lands, which is what made this a PREREQUISITE for that build rather than an adjacent
 * chore — its confirmation OTP gets bounce handling for free (§18.4).
 */
export const CREDENTIAL_TOKEN_TABLES = ["tenant_portal_tokens"] as const

/**
 * A hard bounce means the credential reached nobody, so the token must die.
 *
 * ONLY on a hard bounce:
 *   · `bounced_soft`  — transient, it may still deliver. Revoking would break a working invite.
 *   · `unsubscribed`  — a complaint means it DID arrive; the recipient just objected to it.
 *
 * ⚠ A FAILED REVOKE MUST BE LOUD. This route returns 200 on uninteresting events to stop Resend
 * retrying, and a DB failure here must not silently ride that 200 — an unrevoked live credential
 * is exactly the outcome the whole mechanism exists to prevent. We still return 200 (retrying the
 * webhook would not fix a DB error, and `expires_at` is the 90-day backstop), but the failure is
 * captured at error severity rather than swallowed.
 */
async function revokeCredentialTokensOnHardBounce(
  service: ServiceClient,
  communicationLogId: string,
  eventType: string,
) {
  if (eventType !== "bounced_hard") return

  for (const table of CREDENTIAL_TOKEN_TABLES) {
    const { data, error } = await service.from(table)
      .update({ revoked: true })
      .eq("communication_log_id", communicationLogId)
      .eq("revoked", false)
      .select("id")

    if (error) {
      console.error(`[resend-webhook] FAILED to revoke ${table} after hard bounce — a live credential may have no recipient:`, error.message)
      Sentry.captureException(new Error(`Credential token revoke failed after hard bounce: ${table}`), {
        level: "error",
        extra: { table, communicationLogId, dbError: error.message },
      })
      continue
    }
    if (data?.length) {
      console.warn(`[resend-webhook] revoked ${data.length} ${table} row(s) after hard bounce (comm ${communicationLogId})`)
    }
  }
}

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
    revokeCredentialTokensOnHardBounce(service, logRecord.id, eventType),
  ])

  return NextResponse.json({ ok: true })
}
