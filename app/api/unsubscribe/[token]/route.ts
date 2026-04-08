/**
 * PATCH /api/unsubscribe/[token]
 * Updates communication_preferences via unsubscribe token.
 * No auth required — token is the credential.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_COLUMNS = new Set([
  "unsubscribed_at",
  "email_applications",
  "email_maintenance",
  "email_arrears",
  "email_inspections",
  "email_lease",
  "email_statements",
  "sms_maintenance",
  "sms_arrears",
  "sms_inspections",
])

interface Props {
  params: Promise<{ token: string }>
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const { token } = await params
  const service = getServiceClient()

  // Verify token exists
  const { data: existing } = await service
    .from("communication_preferences")
    .select("id")
    .eq("unsubscribe_token", token)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 })
  }

  const body = await req.json() as Record<string, unknown>

  // Whitelist only known preference columns
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_COLUMNS.has(key)) {
      updates[key] = value
    }
  }

  const { error } = await service
    .from("communication_preferences")
    .update(updates)
    .eq("unsubscribe_token", token)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
