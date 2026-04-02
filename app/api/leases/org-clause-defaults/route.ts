import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface UpdateEntry {
  clause_key: string
  enabled: boolean
}

// POST /api/leases/org-clause-defaults
// Body: { updates: Array<{ clause_key, enabled }> }
// Upserts org-level optional clause toggle defaults.
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

  const body = await req.json() as { updates: UpdateEntry[] }
  if (!Array.isArray(body.updates)) {
    return NextResponse.json({ error: "updates array required" }, { status: 400 })
  }

  const orgId = membership.org_id
  const rows = body.updates.map(({ clause_key, enabled }) => ({
    org_id: orgId,
    clause_key,
    enabled,
  }))

  const { error } = await supabase
    .from("org_lease_clause_defaults")
    .upsert(rows, { onConflict: "org_id,clause_key" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
