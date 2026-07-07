/**
 * app/api/popia/request/route.ts — Create a data-subject request (subject-initiated)
 *
 * Route:  POST /api/popia/request
 * Auth:   Authenticated user (tenant, landlord, supplier, or agent as self)
 * Data:   data_subject_requests (INSERT), organisations (org name lookup)
 * Notes:  Subject-initiated path — user creates a request against an org they are
 *         linked to. Agency-initiated requests are created from the agency inbox UI
 *         via the same function but with submitted_via='agency_initiated'.
 *         Does NOT require agent write access — POPIA right is unconditional.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { createDataSubjectRequest, listControllersForSubject } from "@/lib/popia/requests"
import type { RequestType } from "@/lib/popia/requests"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    org_id: string
    request_type: RequestType
    request_scope?: Record<string, unknown>
    subject_narrative?: string
    subject_full_name?: string
    subject_id_last4?: string
    subject_role_context?: string
  }

  if (!body.org_id || !body.request_type) {
    return NextResponse.json({ error: "org_id and request_type are required" }, { status: 400 })
  }

  // Verify org exists (subject_user_id will be null if the user is not found in user_orgs —
  // that's valid for agency-initiated or email-submitted requests)
  const db = createServiceClient()
  const { data: org, error: orgError } = await (await db)
    .from("organisations")
    .select("id")
    .eq("id", body.org_id)
    .single()
    logQueryError("POST organisations", orgError)

  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 })
  }

  // Bind the request to an org the subject is ACTUALLY linked to (tenant / landlord / supplier / agent) — else any
  // authenticated user could file DSARs against arbitrary orgs by supplying a valid org_id (inbox spam / nuisance).
  // listControllersForSubject enumerates exactly the subject's controller relationships.
  const controllers = await listControllersForSubject(user.id)
  if (!controllers.some((c) => c.org_id === body.org_id)) {
    return NextResponse.json({ error: "You are not linked to this organisation" }, { status: 403 })
  }

  try {
    const request = await createDataSubjectRequest({
      org_id: body.org_id,
      subject_user_id: user.id,
      subject_email: user.email ?? "",
      subject_full_name: body.subject_full_name,
      subject_id_last4: body.subject_id_last4,
      subject_role_context: body.subject_role_context,
      request_type: body.request_type,
      request_scope: body.request_scope,
      subject_narrative: body.subject_narrative,
      submitted_via: "portal",
    })

    return NextResponse.json({ request })
  } catch (err) {
    console.error("[popia/request] create failed:", err)
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 })
  }
}
