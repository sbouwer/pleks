/**
 * app/api/admin/subscription/set-state/route.ts — QA fixture: force subscription state on an org
 *
 * Route:  POST /api/admin/subscription/set-state
 * Auth:   isAdminAuthenticated (ADMIN_SECRET HMAC — never exposed to agents)
 * Data:   subscriptions table via service client
 * Notes:  Testing tool only — sets subscription status + lifecycle timestamps directly.
 *         Use to reproduce paused/past_due/cancelled states without waiting for dunning cron.
 *         Body: { orgId: string, status: SubscriptionStatus, past_due_since?: string | null }
 *         Refuses to set status='purged' (purge is irreversible — use purgeOrg() manually).
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import type { SubscriptionStatus } from "@/lib/subscriptions/state"
import { recordAudit } from "@/lib/audit/recordAudit"

const SETTABLE_STATUSES: SubscriptionStatus[] = [
  "trialing", "active", "past_due", "paused", "pending_cancellation", "cancelled",
]

export async function POST(req: NextRequest) {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (
    typeof body !== "object" || body === null ||
    typeof (body as Record<string, unknown>).orgId !== "string" ||
    typeof (body as Record<string, unknown>).status !== "string"
  ) {
    return NextResponse.json({ error: "Missing orgId or status" }, { status: 400 })
  }

  const { orgId, status, past_due_since } = body as {
    orgId: string
    status: string
    past_due_since?: string | null
  }

  if (!SETTABLE_STATUSES.includes(status as SubscriptionStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${SETTABLE_STATUSES.join(", ")}` },
      { status: 400 },
    )
  }

  const supabase = await createServiceClient()

  const now = new Date().toISOString()
  const patch: Record<string, string | null> = { status }

  // Set lifecycle timestamps that drive cron + banner behaviour
  if (status === "past_due") {
    patch.past_due_since = past_due_since ?? now
    patch.paused_at = null
    patch.cancelled_at = null
  } else if (status === "paused") {
    patch.paused_at = now
    patch.past_due_since = null
    patch.cancelled_at = null
  } else if (status === "cancelled") {
    patch.cancelled_at = now
    patch.paused_at = null
    patch.past_due_since = null
  } else {
    // active / trialing / pending_cancellation → clear all dunning timestamps
    patch.past_due_since = null
    patch.paused_at = null
    patch.cancelled_at = null
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(patch)
    .eq("org_id", orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordAudit(supabase, { orgId: orgId, table: "subscriptions", recordId: orgId, action: "UPDATE", after: { action: "admin_set_subscription_state", status, source: "qa_fixture" } })

  return NextResponse.json({ ok: true, orgId, status })
}
