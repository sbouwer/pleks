/**
 * app/api/cron/subscription-dunning/route.ts — Subscription dunning step (ADDENDUM_57G §11.1)
 *
 * Route:  GET /api/cron/subscription-dunning
 * Auth:   x-cron-secret header
 * Data:   subscriptions table; service client (bypasses RLS)
 * Notes:  Called from daily orchestrator. Idempotent — tracks state via
 *         subscriptions.past_due_since and status column.
 *         day 0: past_due_first · day 7: past_due_day7 · day ≥14: auto-pause.
 *         Also expires unconfirmed PENDING_CANCELLATION requests older than 24h → active.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { sendPastDueFirst, sendPastDueDay7, sendPausedAuto } from "@/lib/subscriptions/emails"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  let pastDueFirst = 0
  let pastDueDay7 = 0
  let autoPaused = 0

  const { data: pastDueSubs, error } = await supabase
    .from("subscriptions")
    .select("id, org_id, past_due_since")
    .eq("status", "past_due")
    .not("past_due_since", "is", null)

  if (error) {
    console.error("subscription-dunning: query failed:", error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  for (const sub of pastDueSubs ?? []) {
    const since = new Date(sub.past_due_since!)
    const daysElapsed = Math.floor((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24))

    const [{ data: org }, { data: adminRow }] = await Promise.all([
      supabase
        .from("organisations")
        .select("name, email, phone, brand_accent_color")
        .eq("id", sub.org_id)
        .single(),
      supabase
        .from("user_orgs")
        .select("user_profiles(email, full_name)")
        .eq("org_id", sub.org_id)
        .in("role", ["owner", "agent"])
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    const profile = adminRow?.user_profiles as unknown as { email: string; full_name?: string } | null
    if (!profile?.email) continue

    const contact = {
      orgId: sub.org_id,
      orgName: org?.name ?? "Pleks",
      adminEmail: profile.email,
      adminName: profile.full_name ?? undefined,
      branding: buildBranding(await fetchOrgSettings(sub.org_id)),
    }

    if (daysElapsed >= 14) {
      // Auto-pause
      const { error: pauseErr } = await supabase
        .from("subscriptions")
        .update({ status: "paused", paused_at: now.toISOString(), pause_reason: "past_due_grace_expired" })
        .eq("id", sub.id)
      if (pauseErr) {
        console.error("subscription-dunning: pause failed for", sub.org_id, pauseErr.message)
        continue
      }
      await supabase.from("audit_log").insert({
        org_id: sub.org_id,
        table_name: "subscriptions",
        record_id: sub.org_id,
        action: "UPDATE",
        new_values: { action: "subscription_paused_auto", reason: "past_due_grace_expired", days_past_due: daysElapsed },
      })
      void sendPausedAuto(contact)
      autoPaused++
    } else if (daysElapsed === 7) {
      // Check idempotency via comm log
      const { data: prior } = await supabase
        .from("communication_log")
        .select("id")
        .eq("org_id", sub.org_id)
        .eq("template_key", "subscription.past_due_day7")
        .limit(1)
      if (prior && prior.length > 0) continue
      void sendPastDueDay7(contact)
      pastDueDay7++
    } else if (daysElapsed === 0) {
      // First notice — check idempotency
      const { data: prior } = await supabase
        .from("communication_log")
        .select("id")
        .eq("org_id", sub.org_id)
        .eq("template_key", "subscription.past_due_first")
        .limit(1)
      if (prior && prior.length > 0) continue
      void sendPastDueFirst(contact)
      pastDueFirst++
    }
  }

  const pendingExpired = await runPendingExpiryStep(supabase, now)

  return Response.json({
    ok: true,
    past_due_first: pastDueFirst,
    past_due_day7: pastDueDay7,
    auto_paused: autoPaused,
    pending_expired: pendingExpired,
  })
}

type SupabaseClient = Awaited<ReturnType<typeof createServiceClient>>

async function runPendingExpiryStep(supabase: SupabaseClient, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const { data: expiredPending, error: expiredErr } = await supabase
    .from("subscriptions")
    .select("id, org_id")
    .eq("status", "pending_cancellation")
    .lt("pending_cancellation_since", cutoff.toISOString())

  if (expiredErr) {
    console.error("subscription-dunning: pending expiry query failed:", expiredErr.message)
    return 0
  }

  let count = 0
  for (const sub of expiredPending ?? []) {
    const { error: revertErr } = await supabase
      .from("subscriptions")
      .update({ status: "active", pending_cancellation_since: null })
      .eq("id", sub.id)
    if (revertErr) {
      console.error("subscription-dunning: pending revert failed for", sub.org_id, revertErr.message)
      continue
    }
    await supabase.from("audit_log").insert({
      org_id: sub.org_id,
      table_name: "subscriptions",
      record_id: sub.org_id,
      action: "UPDATE",
      new_values: { action: "subscription_cancellation_expired" },
    })
    count++
  }
  return count
}
