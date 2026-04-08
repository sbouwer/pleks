import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited } from "@/lib/applications/emails"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: applicationId } = await params
  const body = await req.json()
  const supabase = await createServiceClient()

  const { data: application } = await supabase
    .from("applications")
    .select("org_id, co_applicants_count")
    .eq("id", applicationId)
    .single()

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
