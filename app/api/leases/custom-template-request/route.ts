/**
 * app/api/leases/custom-template-request/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

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
  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)

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
