import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"

async function verifyAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  return token && token === process.env.ADMIN_SECRET
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
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
  if (!(await verifyAdmin())) {
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
