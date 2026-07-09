/**
 * lib/messaging/frequency.ts — per-tenant per-topic frequency limiter
 *
 * Data:   communication_log (service client, no RLS)
 * Notes:  Prevents communication storms. Fails open on DB error so a query
 *         failure never silently blocks a mandatory send.
 *         topic → limit mapping is the single source of truth.
 */

import { createServiceClient } from "@/lib/supabase/server"

type Topic = "arrears" | "inspection" | "maintenance" | "lease" | "monthly_statement" | "portal"

interface Limit {
  maxPerWindow: number
  windowHours: number
}

const LIMITS: Record<Topic, Limit | null> = {
  arrears:           { maxPerWindow: 1, windowHours: 48 },
  inspection:        { maxPerWindow: 2, windowHours: 48 },
  maintenance:       null,                                  // no cap
  lease:             { maxPerWindow: 1, windowHours: 24 },
  monthly_statement: { maxPerWindow: 1, windowHours: 672 }, // 28 days
  portal:            { maxPerWindow: 1, windowHours: 168 }, // 7 days
}

const TOPIC_BY_KEY: Record<string, Topic> = {
  "arrears.reminder_step1":         "arrears",
  "arrears.reminder_step2":         "arrears",
  "arrears.payment_reminder":       "arrears",
  "arrears.arrangement_confirm":    "arrears",
  "arrears.resolved":               "arrears",
  "arrears.payment_received":       "arrears",
  "inspection.scheduled":           "inspection",
  "inspection.reminder":            "inspection",
  "inspection.rescheduled":         "inspection",
  "inspection.report_ready":        "inspection",
  "inspection.move_in_report":      "inspection",
  "maintenance.logged_tenant":      "maintenance",
  "maintenance.assigned":           "maintenance",
  "maintenance.scheduled":          "maintenance",
  "maintenance.completed":          "maintenance",
  "maintenance.delay":              "maintenance",
  "lease.created":                  "lease",
  "lease.sign_reminder":            "lease",
  "lease.signed":                   "lease",
  "lease.activated":                "lease",
  "lease.amended":                  "lease",
  "lease.escalation_notice":        "lease",
  "lease.notice_acknowledged":      "lease",
  "lease.document_emailed":         "lease",
  "rent.monthly_statement":         "monthly_statement",
  "deposit.interest_statement":     "monthly_statement",
  "portal.tenant_invite":           "portal",
  "portal.invite_reminder":         "portal",
  "portal.access_revoked":          "portal",
}

export interface FrequencyCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Returns { allowed: true } if the tenant may receive this template now.
 * Returns { allowed: false, reason } if the frequency cap is exceeded.
 * Fails open (returns allowed=true) if the DB query errors — a limiter
 * must never silently block a mandatory send.
 */
export async function checkFrequencyLimit(
  tenantId: string,
  templateKey: string,
): Promise<FrequencyCheckResult> {
  const topic = TOPIC_BY_KEY[templateKey]
  if (!topic) return { allowed: true }

  const limit = LIMITS[topic]
  if (!limit) return { allowed: true }

  try {
    const service = await createServiceClient()
    const windowStart = new Date(Date.now() - limit.windowHours * 3600 * 1000).toISOString()

    const { count, error } = await service
      .from("communication_log")
      .select("id", { count: "exact", head: true })
      // C-2 fix (comms audit 2026-07-09): count by the tenant_id COLUMN, not entity_type/entity_id — no
      // sender ever writes entity_type='tenant' (they log arrears_case / lease / invoice / application), so
      // every cap counted zero and always allowed. tenant_id is populated on outbound rows.
      .eq("tenant_id", tenantId)
      .in("template_key", Object.keys(TOPIC_BY_KEY).filter((k) => TOPIC_BY_KEY[k] === topic))
      .eq("status", "sent")
      .gte("created_at", windowStart)

    if (error) {
      console.error("[frequency] DB error, failing open:", error.message)
      return { allowed: true }
    }

    if ((count ?? 0) >= limit.maxPerWindow) {
      return {
        allowed: false,
        reason: `frequency_limit:${topic}:${limit.maxPerWindow}_per_${limit.windowHours}h`,
      }
    }

    return { allowed: true }
  } catch (err) {
    console.error("[frequency] Unexpected error, failing open:", err)
    return { allowed: true }
  }
}
