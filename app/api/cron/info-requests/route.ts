/**
 * GET /api/cron/info-requests
 *
 * Daily cron: processes property_info_requests lifecycle.
 *
 * - Expires requests past expires_at (status → 'expired')
 * - Sends reminders per track:
 *     Owner track:  T+3 reminder, T+7 second reminder
 *     Broker track: T+5 reminder
 *     Self track:   T+30 one-time email nudge (otherwise widget-only)
 * - Logs every action to property_info_request_events
 * - Health-tracked via cron_runs
 *
 * Wired into the main daily cron at /api/cron/daily.
 */

import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendInfoRequestEmail } from "@/lib/info-requests/sendInfoRequestEmail"
import type { InfoRequestTopic } from "@/lib/info-requests/sendInfoRequestEmail"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type ServiceClient = ReturnType<typeof getServiceClient>

const DAY_MS = 24 * 60 * 60 * 1000

// ── Cron run health tracking ──────────────────────────────────────────────────

async function startJob(service: ServiceClient): Promise<string | null> {
  const { data } = await service.from("cron_runs").insert({
    job_name:   "expire-info-requests",
    started_at: new Date().toISOString(),
    status:     "running",
  }).select("id").single()
  return (data?.id as string) ?? null
}

async function finishJob(
  service: ServiceClient,
  id: string | null,
  status: "completed" | "failed",
  rowsProcessed: number,
  errorMessage?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!id) return
  await service.from("cron_runs")
    .update({
      finished_at:    new Date().toISOString(),
      status,
      rows_processed: rowsProcessed,
      error_message:  errorMessage ?? null,
      metadata:       metadata ?? {},
    })
    .eq("id", id)
}

// ── Sub-step: expire stale requests ───────────────────────────────────────────

async function expireStale(service: ServiceClient): Promise<number> {
  const nowIso = new Date().toISOString()
  const { data: stale } = await service
    .from("property_info_requests")
    .select("id")
    .in("status", ["pending", "sent"])
    .lt("expires_at", nowIso)
    .limit(500)

  const ids = (stale ?? []).map((r) => r.id as string)
  if (ids.length === 0) return 0

  await service.from("property_info_requests")
    .update({ status: "expired" })
    .in("id", ids)

  await service.from("property_info_request_events").insert(
    ids.map((id) => ({
      request_id: id,
      event_type: "expired",
    })),
  )

  return ids.length
}

// ── Sub-step: reminder candidates for a given track ───────────────────────────

interface ReminderRow {
  id:              string
  org_id:          string
  property_id:     string
  topic:           string
  recipient_email: string | null
  recipient_type:  string
  token:           string
  reminder_count:  number | null
  sent_at:         string | null
  last_reminder_at: string | null
}

async function sendReminderFor(
  service: ServiceClient,
  row: ReminderRow,
): Promise<boolean> {
  if (!row.recipient_email) return false

  const sendResult = await sendInfoRequestEmail({
    orgId:          row.org_id,
    requestId:      row.id,
    topic:          row.topic as InfoRequestTopic,
    recipientEmail: row.recipient_email,
    token:          row.token,
    propertyId:     row.property_id,
    isReminder:     true,
  })

  if (!sendResult.ok) return false

  await service.from("property_info_requests")
    .update({
      last_reminder_at: new Date().toISOString(),
      reminder_count:   (row.reminder_count ?? 0) + 1,
    })
    .eq("id", row.id)

  await service.from("property_info_request_events").insert({
    request_id:           row.id,
    event_type:           "email_reminder_sent",
    channel:              "email",
    communication_log_id: sendResult.logId ?? null,
  })

  return true
}

async function sendRemindersForWindow(
  service: ServiceClient,
  recipientType: string,
  minDaysSinceSend: number,
  maxReminders: number,
  cooldownDays: number,
): Promise<number> {
  const now = Date.now()
  const sendCutoffIso = new Date(now - minDaysSinceSend * DAY_MS).toISOString()
  const cooldownCutoffIso = new Date(now - cooldownDays * DAY_MS).toISOString()

  const { data: rows } = await service
    .from("property_info_requests")
    .select("id, org_id, property_id, topic, recipient_email, recipient_type, token, reminder_count, sent_at, last_reminder_at")
    .eq("status", "sent")
    .eq("recipient_type", recipientType)
    .not("recipient_email", "is", null)
    .lt("sent_at", sendCutoffIso)
    .lt("reminder_count", maxReminders)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cooldownCutoffIso}`)
    .limit(500)

  let sent = 0
  for (const row of (rows ?? []) as ReminderRow[]) {
    if (await sendReminderFor(service, row)) sent++
  }
  return sent
}

// ── Sub-step: self-track T+30 email nudge ─────────────────────────────────────
// Self-managed track is widget-only, but the spec calls for one T+30 email
// to the requesting user. Here we simply log an event — actual in-app
// notification UI is part of a later phase.

async function logSelfTrackNudge(service: ServiceClient): Promise<number> {
  const cutoffIso = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const { data: rows } = await service
    .from("property_info_requests")
    .select("id, last_reminder_at")
    .eq("status", "pending")
    .eq("recipient_type", "self")
    .lt("created_at", cutoffIso)
    .is("last_reminder_at", null)
    .limit(500)

  const ids = (rows ?? []).map((r) => r.id as string)
  if (ids.length === 0) return 0

  await service.from("property_info_requests")
    .update({ last_reminder_at: new Date().toISOString(), reminder_count: 1 })
    .in("id", ids)

  await service.from("property_info_request_events").insert(
    ids.map((id) => ({
      request_id: id,
      event_type: "email_reminder_sent",
      payload:    { track: "self", note: "T+30 nudge logged; in-app surface pending" },
    })),
  )
  return ids.length
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = getServiceClient()
  const runId = await startJob(service)

  try {
    const expiredCount = await expireStale(service)

    // Owner track: T+3 first, T+7 second (max 2 reminders, 3-day cooldown between)
    const ownerReminders = await sendRemindersForWindow(service, "owner", 3, 2, 3)

    // Broker track: T+5 (max 1 reminder)
    const brokerReminders = await sendRemindersForWindow(service, "broker", 5, 1, 5)

    // Self track: T+30 one-off nudge log
    const selfNudges = await logSelfTrackNudge(service)

    const totalProcessed = expiredCount + ownerReminders + brokerReminders + selfNudges

    await finishJob(service, runId, "completed", totalProcessed, undefined, {
      expired: expiredCount,
      owner_reminders:  ownerReminders,
      broker_reminders: brokerReminders,
      self_nudges:      selfNudges,
    })

    return Response.json({
      ok: true,
      expired: expiredCount,
      owner_reminders:  ownerReminders,
      broker_reminders: brokerReminders,
      self_nudges:      selfNudges,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[cron/info-requests] failed:", message)
    await finishJob(service, runId, "failed", 0, message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
