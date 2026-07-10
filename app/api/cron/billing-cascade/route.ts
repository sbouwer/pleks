/**
 * app/api/cron/billing-cascade/route.ts — silent period-lapse DETECTOR (ADDENDUM_57H)
 *
 * Route:  GET /api/cron/billing-cascade
 * Auth:   x-cron-secret header — called by the daily orchestrator, not directly by Vercel
 * Data:   subscriptions, audit_log via service client
 * Notes:  Detector-only (57H convergence). A silent period-lapse — an `active` paid sub whose billing
 *         period elapsed with NO PayFast FAILED webhook — is moved `active → past_due` with
 *         `past_due_since = now` (detection time, D-57H-03). It emits NO email and NO terminal transition;
 *         it is simply a second entry point into the SINGLE dunning ladder owned by `subscription-dunning`
 *         (past_due_first → past_due_day7 → paused_auto, keyed off `past_due_since`). The former Stage B
 *         (reminder) and Stage C (`past_due → cancelled` + `account_frozen`) are retired: 57G sanctions
 *         exactly one automated non-payment transition — `past_due → paused` — and `cancelled` is
 *         user-initiated only. Long-paused non-payers are reclaimed by the dormancy/purge ladder, not here.
 */

import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron/auth"
import { optionalEnv } from "@/lib/env"

function pingHeartbeat(url: string | undefined): void {
  if (url) void fetch(url, { method: "POST" }).catch(() => undefined)
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createServiceClient()
  const now = new Date()
  let markedPastDue = 0

  // Detect silent period-lapse: a paid (`amount_cents > 0`) `active` sub whose billing period has elapsed
  // without a FAILED webhook (which would already have moved it to past_due). Move it into the single ladder.
  const { data: overdueActive, error: overdueErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, amount_cents, current_period_end")
    .eq("status", "active")
    .gt("amount_cents", 0)
    .lt("current_period_end", now.toISOString())
    .not("current_period_end", "is", null)

  if (overdueErr) {
    console.error("billing-cascade detector query failed:", overdueErr.message)
    return Response.json({ ok: false, error: overdueErr.message }, { status: 500 })
  }

  for (const sub of overdueActive ?? []) {
    // Anchor past_due_since to detection time (now), not period-end (D-57H-03) — kinder, and prevents a
    // late-detected lapse from firing past_due_first + past_due_day7 in a compressed burst. The dunning
    // ladder keys off past_due_since uniformly; no grace_period_end is set on this path.
    const { error: updateErr } = await supabase
      .from("subscriptions")
      .update({ status: "past_due", past_due_since: now.toISOString() })
      .eq("id", sub.id)

    if (updateErr) {
      console.error("billing-cascade detector update failed:", sub.id, updateErr.message)
      continue
    }

    await supabase.from("audit_log").insert({
      org_id: sub.org_id,
      table_name: "subscriptions",
      record_id: sub.org_id,
      action: "UPDATE",
      new_values: {
        action: "subscription_past_due_entered",
        trigger: "silent_period_lapse",
        amount_cents: sub.amount_cents,
      },
    })

    markedPastDue++
  }

  pingHeartbeat(optionalEnv("HEARTBEAT_BILLING_CASCADE"))

  return Response.json({ ok: true, marked_past_due: markedPastDue })
}
