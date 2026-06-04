/**
 * app/api/cron/billing-cascade/route.ts — Subscription past-due → cancelled lifecycle
 *
 * Route:  GET /api/cron/billing-cascade
 * Auth:   x-cron-secret header — called by daily orchestrator, not directly by Vercel
 * Data:   subscriptions, communication_log via service client
 * Notes:  3-stage: active→past_due (Day 0), reminder (~Day 4), past_due→cancelled (Day 14).
 *         Email copy still uses "account_frozen" label — pending content rewrite.
 */

import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import {
  sendPaymentFailed,
  sendPaymentReminder,
  sendAccountFrozen,
} from "@/lib/subscriptions/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"

const GRACE_DAYS = 14
const REMINDER_WINDOW_DAYS = { min: 9, max: 11 } // ~4 days in from 14-day window

function pingHeartbeat(url: string | undefined): void {
  if (url) void fetch(url, { method: "POST" }).catch(() => undefined)
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  // ── Helper: fetch org branding + admin email ───────────────────────────────
  async function fetchOrgContact(orgId: string) {
    const [{ data: org }, { data: adminRow }] = await Promise.all([
      supabase
        .from("organisations")
        .select("name, email, phone, brand_accent_color")
        .eq("id", orgId)
        .single(),
      supabase
        .from("user_orgs")
        .select("user_profiles(email, full_name)")
        .eq("org_id", orgId)
        .in("role", ["owner", "agent"])
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    const profile = adminRow?.user_profiles as unknown as { email: string; full_name?: string } | null
    if (!profile?.email) return null

    return {
      orgId,
      orgName: org?.name ?? "Pleks",
      adminEmail: profile.email,
      adminName: profile.full_name ?? undefined,
      branding: buildBranding(await fetchOrgSettings(orgId)),
    }
  }

  // ── Helper: check if a billing cascade email was already sent this cycle ───
  async function alreadySent(orgId: string, templateKey: string, sinceDate: Date) {
    const { data, error: queryError } = await supabase
      .from("communication_log")
      .select("id")
      .eq("org_id", orgId)
      .eq("template_key", templateKey)
      .gte("created_at", sinceDate.toISOString())
      .limit(1)
    logQueryError("alreadySent communication_log", queryError)
    return (data?.length ?? 0) > 0
  }

  let markedPastDue = 0
  let reminded = 0
  let cancelled = 0

  // ── Stage A: active → past_due ────────────────────────────────────────────
  // Only paid subscriptions (amount_cents > 0) whose billing period has elapsed.
  const { data: overdueActive, error: overdueErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, amount_cents, current_period_end")
    .eq("status", "active")
    .gt("amount_cents", 0)
    .lt("current_period_end", now.toISOString())
    .not("current_period_end", "is", null)

  if (overdueErr) {
    console.error("billing-cascade Stage A query failed:", overdueErr.message)
  }

  for (const sub of overdueActive ?? []) {
    const periodEnd = new Date(sub.current_period_end as string)
    const gracePeriodEnd = new Date(periodEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)

    // Transition to past_due
    const { error: updateErr } = await supabase
      .from("subscriptions")
      .update({ status: "past_due", grace_period_end: gracePeriodEnd.toISOString() })
      .eq("id", sub.id)

    if (updateErr) {
      console.error("billing-cascade Stage A update failed:", sub.id, updateErr.message)
      continue
    }

    await supabase.from("audit_log").insert({
      org_id: sub.org_id,
      table_name: "subscriptions",
      record_id: sub.org_id,
      action: "UPDATE",
      new_values: {
        action: "marked_past_due",
        amount_cents: sub.amount_cents,
        grace_period_end: gracePeriodEnd.toISOString(),
      },
    })

    // Send day-0 notification (dedup: skip if already sent in last 20 days)
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
    const sent = await alreadySent(sub.org_id, "subscription.payment_failed", twentyDaysAgo)
    if (!sent) {
      const contact = await fetchOrgContact(sub.org_id)
      if (contact) {
        void sendPaymentFailed(contact, sub.amount_cents as number, gracePeriodEnd.toISOString())
      }
    }

    markedPastDue++
  }

  // ── Stage B: day ~4 reminder ───────────────────────────────────────────────
  // grace_period_end is between 9 and 11 days from now (~4 days into 14-day window).
  const minDays = new Date(now.getTime() + REMINDER_WINDOW_DAYS.min * 24 * 60 * 60 * 1000)
  const maxDays = new Date(now.getTime() + REMINDER_WINDOW_DAYS.max * 24 * 60 * 60 * 1000)

  const { data: pastDueForReminder, error: reminderErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, amount_cents, grace_period_end")
    .eq("status", "past_due")
    .gt("amount_cents", 0)
    .gte("grace_period_end", minDays.toISOString())
    .lte("grace_period_end", maxDays.toISOString())

  if (reminderErr) {
    console.error("billing-cascade Stage B query failed:", reminderErr.message)
  }

  for (const sub of pastDueForReminder ?? []) {
    // Dedup: skip if reminder already sent in last 5 days
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    const sent = await alreadySent(sub.org_id, "subscription.payment_reminder", fiveDaysAgo)
    if (sent) continue

    const contact = await fetchOrgContact(sub.org_id)
    if (contact) {
      void sendPaymentReminder(
        contact,
        sub.amount_cents as number,
        sub.grace_period_end as string,
      )
    }

    reminded++
  }

  // ── Stage C: past_due → cancelled ─────────────────────────────────────────
  const { data: expiredGrace, error: cancelErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, amount_cents")
    .eq("status", "past_due")
    .gt("amount_cents", 0)
    .lt("grace_period_end", now.toISOString())

  if (cancelErr) {
    console.error("billing-cascade Stage C query failed:", cancelErr.message)
  }

  for (const sub of expiredGrace ?? []) {
    const { error: cancelUpdateErr } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: now.toISOString() })
      .eq("id", sub.id)

    if (cancelUpdateErr) {
      console.error("billing-cascade Stage C update failed:", sub.id, cancelUpdateErr.message)
      continue
    }

    await supabase.from("audit_log").insert({
      org_id: sub.org_id,
      table_name: "subscriptions",
      record_id: sub.org_id,
      action: "UPDATE",
      new_values: {
        action: "subscription_cancelled_after_grace",
        amount_cents: sub.amount_cents,
        cancelled_at: now.toISOString(),
      },
    })

    // Send cancellation notification (dedup: skip if already sent in last 20 days).
    // Email function name + template key kept as sendAccountFrozen / "account_frozen"
    // for now — pending follow-up rename of the email copy itself.
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
    const sent = await alreadySent(sub.org_id, "subscription.account_frozen", twentyDaysAgo)
    if (!sent) {
      const contact = await fetchOrgContact(sub.org_id)
      if (contact) {
        void sendAccountFrozen(contact, sub.amount_cents as number)
      }
    }

    cancelled++
  }

  pingHeartbeat(process.env.HEARTBEAT_BILLING_CASCADE)

  return Response.json({ ok: true, marked_past_due: markedPastDue, reminded, cancelled })
}
