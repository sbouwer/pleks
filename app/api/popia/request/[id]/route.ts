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
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- VALIDATE-THEN-ACT, and the org filter would BREAK it: the caller may be the data SUBJECT, who is not a member of the responsible org at all, so scoping this read to the caller's org would deny the POPIA s23 access right. Authorisation is the `isSubject || isOrgMember` test below, where membership is checked as user.id ⨯ request.org_id and a 403 returns before any row reaches the response. M-061 (2026-08-28) made this visible by requiring the org signal to PRECEDE the read; here it legitimately cannot.
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
