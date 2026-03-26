import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId } = (await req.json()) as { orgId?: string }
  if (!orgId) {
    return NextResponse.json(
      { error: "orgId is required" },
      { status: 400 }
    )
  }

  // Verify user belongs to this org
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 })
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  const now = new Date().toISOString()

  const { error: updateError } = await supabase
    .from("organisations")
    .update({
      clause_edit_confirmed_at: now,
      clause_edit_confirmed_by: user.id,
      clause_edit_confirmed_ip: clientIp,
    })
    .eq("id", orgId)

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    )
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "organisations",
    record_id: orgId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: {
      clause_edit_confirmed_at: now,
      clause_edit_confirmed_ip: clientIp,
    },
  })

  return NextResponse.json({ ok: true })
}
