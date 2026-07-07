/**
 * app/api/org/notifications/route.ts — read/update the org's notification-channel settings
 *
 * Route:  GET/PATCH /api/org/notifications
 * Auth:   gateway() (agent session + org membership)
 * Data:   organisations.notification_settings (JSON column), org-scoped via gateway orgId.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess. Notification preferences
 *         are the org's own settings; a paused org editing them is "your data, always", not net-new value.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

const DEFAULT_SETTINGS = {
  email_from_name: null as string | null,
  reply_to_email: null as string | null,
  email_applications: true,
  email_maintenance: true,
  email_arrears: true,
  email_inspections: true,
  email_lease: true,
  email_statements: true,
  sms_enabled: false,
  sms_maintenance: true,
  sms_arrears: false,
  sms_inspections: true,
}

export type NotificationSettings = typeof DEFAULT_SETTINGS

const BOOLEAN_KEYS = [
  "email_applications", "email_maintenance", "email_arrears", "email_inspections", "email_lease", "email_statements",
  "sms_enabled", "sms_maintenance", "sms_arrears", "sms_inspections",
] as const
const STRING_KEYS = ["email_from_name", "reply_to_email"] as const

/** Take ONLY known settings keys from the client body, coerced to the right type + bounded — never spread the raw
 *  body into the JSON column (that let a client persist arbitrary keys / wrong types / unbounded strings). */
function sanitiseSettings(body: Record<string, unknown>): Partial<NotificationSettings> {
  const out: Partial<NotificationSettings> = {}
  for (const k of BOOLEAN_KEYS) if (k in body) out[k] = body[k] === true
  for (const k of STRING_KEYS) {
    if (k in body) {
      const v = body[k]
      out[k] = typeof v === "string" ? (v.trim().slice(0, 200) || null) : null
    }
  }
  return out
}

// GET /api/org/notifications
export async function GET() {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: org, error: orgError } = await db
    .from("organisations")
    .select("notification_settings")
    .eq("id", orgId)
    .single()
  logQueryError("GET organisations", orgError)

  const settings = { ...DEFAULT_SETTINGS, ...(org?.notification_settings as Partial<NotificationSettings> ?? {}) }
  return NextResponse.json(settings)
}

// PATCH /api/org/notifications
export async function PATCH(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const body = await req.json() as Record<string, unknown>

  // Fetch current settings and merge
  const { data: org, error: orgError } = await db
    .from("organisations")
    .select("notification_settings")
    .eq("id", orgId)
    .single()
  logQueryError("PATCH organisations", orgError)

  const current = { ...DEFAULT_SETTINGS, ...(org?.notification_settings as Partial<NotificationSettings> ?? {}) }
  const updated = { ...current, ...sanitiseSettings(body) }

  const { error } = await db
    .from("organisations")
    .update({ notification_settings: updated })
    .eq("id", orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}
