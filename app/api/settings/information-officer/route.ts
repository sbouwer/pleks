/**
 * app/api/settings/information-officer/route.ts — Update org Information Officer details
 *
 * Auth:   gateway() — org member; owner/property_manager role required
 * Data:   organisations.settings.information_officer (JSONB merge patch)
 * Notes:  IO details flow into DSR rejection emails and public /privacy/information-officer page.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"

interface IoPayload {
  name?: string
  email?: string
  phone?: string
  postal_address?: string
}

export async function PATCH(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { orgId, userId } = gw

  const body = await req.json() as { information_officer?: IoPayload }
  if (!body.information_officer) {
    return NextResponse.json({ error: "information_officer is required" }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: uo, error: roleErr } = await (await db)
    .from("user_orgs")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single()

  if (roleErr || !uo) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (uo.role !== "owner" && uo.role !== "property_manager") {
    return NextResponse.json(
      { error: "Only owners and property managers can update IO details" },
      { status: 403 },
    )
  }

  // Read current settings, merge IO details, write back
  const { data: org, error: readErr } = await (await db)
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single()

  if (readErr || !org) {
    console.error("IO update — read failed:", readErr?.message)
    return NextResponse.json({ error: "Failed to read org settings" }, { status: 500 })
  }

  const existingSettings = (org.settings as Record<string, unknown> | null) ?? {}
  const merged = {
    ...existingSettings,
    information_officer: body.information_officer,
  }

  const { error: writeErr } = await (await db)
    .from("organisations")
    .update({ settings: merged })
    .eq("id", orgId)

  if (writeErr) {
    console.error("IO update — write failed:", writeErr.message)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
