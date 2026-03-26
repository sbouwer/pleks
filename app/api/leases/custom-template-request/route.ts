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

  const { templatePath, notes } = (await req.json()) as {
    templatePath?: string
    notes?: string
  }

  if (!templatePath) {
    return NextResponse.json(
      { error: "templatePath is required" },
      { status: 400 }
    )
  }

  // Get user's org
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: "No org" }, { status: 403 })
  }

  const now = new Date().toISOString()

  const { error: insertError } = await supabase
    .from("custom_lease_requests")
    .insert({
      org_id: membership.org_id,
      submitted_by: user.id,
      template_path: templatePath,
      notes: notes ?? null,
      status: "pending",
      compliance_confirmed_at: now,
      compliance_confirmed_by: user.id,
    })

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
