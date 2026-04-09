/**
 * Peach DebiCheck webhook handler.
 *
 * STATUS: DISABLED — DebiCheck is a planned feature, not yet live.
 * Returns 503 for all incoming requests so no forged payload can trigger DB writes.
 *
 * TO ENABLE: set PEACH_WEBHOOK_SECRET in env and replace the POST export below
 * with the full implementation in the comment block at the bottom of this file.
 */

import { NextResponse } from "next/server"

export async function POST(_req: Request) {
  return NextResponse.json({ error: "Not yet active" }, { status: 503 })
}

/*
 * ─── Full implementation (activate when Peach DebiCheck goes live) ───────────
 *
 * import { createHmac, timingSafeEqual } from "node:crypto"
 * import { createServiceClient } from "@/lib/supabase/server"
 * import { type PeachWebhookEvent, translateFailureCode, shouldRetry } from "@/lib/peach/types"
 * import { addBusinessDays, startOfMonth } from "date-fns"
 *
 * async function verifyPeachSignature(req: Request, rawBody: string): Promise<boolean> {
 *   const secret = process.env.PEACH_WEBHOOK_SECRET
 *   if (!secret) return false
 *   const signature = req.headers.get("x-peach-signature")
 *   if (!signature) return false
 *   const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
 *   try { return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) }
 *   catch { return false }
 * }
 *
 * type Supa = Awaited<ReturnType<typeof createServiceClient>>
 *
 * async function handleMandateAuthenticated(supabase: Supa, event: PeachWebhookEvent) { ... }
 * async function handleCollectionSuccessful(supabase: Supa, event: PeachWebhookEvent) { ... }
 * async function handleCollectionFailed(supabase: Supa, event: PeachWebhookEvent) { ... }
 *
 * export async function POST(req: Request) {
 *   const rawBody = await req.text()
 *   const valid = await verifyPeachSignature(req, rawBody)
 *   if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
 *   const event = JSON.parse(rawBody) as PeachWebhookEvent
 *   const supabase = await createServiceClient()
 *   switch (event.event_type) { ... }
 *   return NextResponse.json({ ok: true })
 * }
 */
