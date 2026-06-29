/**
 * app/api/applications/[id]/co-applicant/route.ts — invite a co-applicant / guarantor onto an application.
 *
 * Route:  POST /api/applications/[id]/co-applicant
 * Auth:   PUBLIC / unauthenticated by design — the apply flow has no session. Service client; the application
 *         id in the path is the capability. Rate-limited per IP (it sends an invite email). org_id is read
 *         from the application server-side, never trusted from the client.
 * Data:   inserts application_co_applicants (incl. id_number + id_number_hash so the person can be LINKED to
 *         the application at promotion), bumps applications.co_applicants_count, emails the invitee a link.
 * Notes:  id_number is hashed at rest (hashIdNumber) and never logged. The invite email is best-effort.
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { hashIdNumber, encryptIdNumber } from "@/lib/crypto/idNumber"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!rateLimit(`coapp-invite:${getClientIp(req)}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { id: applicationId } = await params
  const body = await req.json()
  const supabase = await createServiceClient()

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("org_id, co_applicants_count")
    .eq("id", applicationId)
    .single()
    logQueryError("POST applications", applicationError)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  const { data: coApplicant, error } = await supabase
    .from("application_co_applicants")
    .insert({
      org_id: application.org_id,
      primary_application_id: applicationId,
      co_applicant_index: (application.co_applicants_count || 0) + 1,
      first_name: body.first_name,
      last_name: body.last_name,
      applicant_email: body.email,
      applicant_phone: body.phone || null,
      id_type: body.id_type || null,
      id_number: encryptIdNumber(body.id_number), // encrypted at rest; the hash (from RAW) stays the lookup key
      id_number_hash: body.id_number ? hashIdNumber(body.id_number) : null,
      role: body.role === "guarantor" ? "guarantor" : "co_applicant",
    })
    .select("id, access_token")
    .single()

  if (error || !coApplicant) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }

  // Update application
  await supabase.from("applications").update({
    has_co_applicant: true,
    co_applicants_count: (application.co_applicants_count || 0) + 1,
  }).eq("id", applicationId)

  // Send co-applicant invitation email
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) {
      const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
      void sendCoApplicantInvited(
        { firstName: body.first_name, email: body.email },
        ctx.listingSummary,
        ctx.orgContext,
        { accessToken: coApplicant.access_token, primaryApplicantName: primaryName }
      )
    }
  } catch (e) { console.error("sendCoApplicantInvited failed:", e) }

  return NextResponse.json({ ok: true, coApplicantId: coApplicant.id })
}
