/**
 * app/api/admin/org-clause/route.ts — set/clear an org-level custom lease clause body
 *
 * Route:  POST, DELETE /api/admin/org-clause
 * Auth:   isAdminAuthenticated() (admin portal HMAC gate)
 * Data:   upserts/deletes lease_clause_selections (lease_id = NULL = org default)
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId, clauseKey, customBody } = await req.json()
  if (!orgId || !clauseKey) {
    return NextResponse.json({ error: "orgId and clauseKey required" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Upsert org-level custom body (lease_id = NULL)
  const { error } = await supabase
    .from("lease_clause_selections")
    .upsert({
      org_id: orgId,
      lease_id: null,
      clause_key: clauseKey,
      enabled: true,
      custom_body: customBody,
    }, {
      onConflict: "org_id,clause_key",
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId, clauseKey } = await req.json()
  if (!orgId || !clauseKey) {
    return NextResponse.json({ error: "orgId and clauseKey required" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  await supabase
    .from("lease_clause_selections")
    .delete()
    .eq("org_id", orgId)
    .eq("clause_key", clauseKey)
    .is("lease_id", null)

  return NextResponse.json({ ok: true })
}
