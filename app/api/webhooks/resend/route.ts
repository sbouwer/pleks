/**
 * Resend webhook handler.
 *
 * STATUS: DISABLED — Resend delivery tracking is a planned feature, not yet wired up.
 * Returns 503 for all incoming requests so no forged payload can trigger DB writes.
 *
 * TO ENABLE: set RESEND_WEBHOOK_SECRET in env (Svix signing secret from Resend dashboard)
 * and replace the POST export below with the full implementation at the bottom of this file.
 */

import { NextResponse } from "next/server"

export async function POST(_req: Request) {
  return NextResponse.json({ error: "Not yet active" }, { status: 503 })
}

/*
 * ─── Full implementation (activate when Resend webhook tracking goes live) ───
 *
 * import { NextRequest, NextResponse } from "next/server"
 * import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js"
 *
 * function getServiceClient() {
 *   return createSupabaseServiceClient(
 *     process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     process.env.SUPABASE_SERVICE_ROLE_KEY!
 *   )
 * }
 *
 * const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET
 *
 * interface ResendWebhookPayload {
 *   type: "email.sent" | "email.delivered" | "email.delivery_delayed" | "email.complained" | "email.bounced" | "email.opened" | "email.clicked"
 *   created_at: string
 *   data: {
 *     email_id: string
 *     from: string
 *     to: string[]
 *     subject: string
 *     bounce?: { type: "permanent" | "transient" }
 *   }
 * }
 *
 * async function verifyResendSignature(req: NextRequest, body: string): Promise<boolean> {
 *   if (!RESEND_WEBHOOK_SECRET) return false
 *   const signature = req.headers.get("svix-signature")
 *   const msgId = req.headers.get("svix-id")
 *   const timestamp = req.headers.get("svix-timestamp")
 *   if (!signature || !msgId || !timestamp) return false
 *   try {
 *     const { Webhook } = await import("svix")
 *     const wh = new Webhook(RESEND_WEBHOOK_SECRET)
 *     wh.verify(body, { "svix-id": msgId, "svix-timestamp": timestamp, "svix-signature": signature })
 *     return true
 *   } catch { return false }
 * }
 *
 * export async function POST(req: NextRequest) {
 *   const body = await req.text()
 *   const isValid = await verifyResendSignature(req, body)
 *   if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
 *
 *   const payload = JSON.parse(body) as ResendWebhookPayload
 *   const service = getServiceClient()
 *
 *   const { data: logRecord } = await service
 *     .from("communication_log")
 *     .select("id, sent_to_email, org_id")
 *     .eq("external_id", payload.data.email_id)
 *     .maybeSingle()
 *   if (!logRecord) return NextResponse.json({ ok: true })
 *
 *   const statusMap: Record<string, string> = {
 *     "email.delivered": "delivered", "email.opened": "opened",
 *     "email.clicked": "clicked", "email.bounced": "bounced",
 *     "email.complained": "unsubscribed",
 *   }
 *   const newStatus = statusMap[payload.type]
 *   if (!newStatus) return NextResponse.json({ ok: true })
 *
 *   const updates: Record<string, unknown> = { status: newStatus, provider_response: payload }
 *   if (newStatus === "delivered") updates.delivered_at = payload.created_at
 *   if (newStatus === "opened")    updates.opened_at = payload.created_at
 *   await service.from("communication_log").update(updates).eq("id", logRecord.id)
 *
 *   if (newStatus === "bounced" && payload.data.bounce?.type === "permanent" && logRecord.sent_to_email) {
 *     await service.from("communication_preferences").upsert(
 *       { org_id: logRecord.org_id, email: logRecord.sent_to_email, email_hard_bounced: true, email_hard_bounced_at: payload.created_at, updated_at: new Date().toISOString() },
 *       { onConflict: "org_id,email" }
 *     )
 *   }
 *   if (newStatus === "unsubscribed" && logRecord.sent_to_email) {
 *     await service.from("communication_preferences").upsert(
 *       { org_id: logRecord.org_id, email: logRecord.sent_to_email, unsubscribed_at: payload.created_at, updated_at: new Date().toISOString() },
 *       { onConflict: "org_id,email" }
 *     )
 *   }
 *
 *   return NextResponse.json({ ok: true })
 * }
 */
