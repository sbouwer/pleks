import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Save or reset custom clause body (org-level when leaseId omitted)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { clauseKey, customBody, leaseId } = await req.json()

  if (!clauseKey) {
    return NextResponse.json({ error: "clauseKey required" }, { status: 400 })
  }

  // Upsert custom body
  const { error } = await supabase
    .from("lease_clause_selections")
    .upsert({
      org_id: membership.org_id,
      lease_id: leaseId ?? null,
      clause_key: clauseKey,
      enabled: true,
      custom_body: customBody,
    }, {
      onConflict: "org_id,clause_key,lease_id",
      ignoreDuplicates: false,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: membership.org_id,
    table_name: "lease_clause_selections",
    record_id: clauseKey,
    action: "UPDATE",
    changed_by: user.id,
    new_values: {
      action: "clause_wording_edited",
      clause_key: clauseKey,
      scope: leaseId ? "per_lease" : "org_default",
    },
  })

  return NextResponse.json({ ok: true })
}

// Reset clause to standard (delete custom body)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { clauseKey, leaseId } = await req.json()

  if (!clauseKey) {
    return NextResponse.json({ error: "clauseKey required" }, { status: 400 })
  }

  let query = supabase
    .from("lease_clause_selections")
    .delete()
    .eq("org_id", membership.org_id)
    .eq("clause_key", clauseKey)

  if (leaseId) {
    query = query.eq("lease_id", leaseId)
  } else {
    query = query.is("lease_id", null)
  }

  await query

  return NextResponse.json({ ok: true })
}
