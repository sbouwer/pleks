import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  return data?.org_id ?? null
}

// GET /api/org/notifications
export async function GET() {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: org } = await supabase
    .from("organisations")
    .select("notification_settings")
    .eq("id", orgId)
    .single()

  const settings = { ...DEFAULT_SETTINGS, ...(org?.notification_settings as Partial<NotificationSettings> ?? {}) }
  return NextResponse.json(settings)
}

// PATCH /api/org/notifications
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as Partial<NotificationSettings>

  // Fetch current settings and merge
  const { data: org } = await supabase
    .from("organisations")
    .select("notification_settings")
    .eq("id", orgId)
    .single()

  const current = { ...DEFAULT_SETTINGS, ...(org?.notification_settings as Partial<NotificationSettings> ?? {}) }
  const updated = { ...current, ...body }

  const { error } = await supabase
    .from("organisations")
    .update({ notification_settings: updated })
    .eq("id", orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}
