/**
 * app/api/popia/request/[id]/route.ts — Get a single data-subject request
 *
 * Route:  GET /api/popia/request/:id
 * Auth:   Subject (owns the request) or agency staff (org member)
 * Data:   data_subject_requests (SELECT via service role + manual auth check)
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = createServiceClient()
  const { data: request, error } = await (await db)
    .from("data_subject_requests")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Auth: subject sees own request; org staff sees org's request
  const isSubject =
    request.subject_user_id === user.id ||
    request.subject_email?.toLowerCase() === user.email?.toLowerCase()

  const { data: orgMembership, error: orgMembershipError } = await (await db)
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", request.org_id)
    .is("deleted_at", null)
    .single()
    logQueryError("GET user_orgs", orgMembershipError)

  const isOrgMember = !!orgMembership

  if (!isSubject && !isOrgMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json({ request })
}
