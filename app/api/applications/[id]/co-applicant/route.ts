/**
 * app/api/applications/[id]/co-applicant/route.ts — invite a co-applicant / guarantor onto an application.
 *
 * Route:  POST /api/applications/[id]/co-applicant
 * Auth:   PUBLIC / unauthenticated by design — the apply flow has no session. Service client; the application
 *         id in the path is the capability. Rate-limited per IP (it sends an invite email). org_id is read
 *         from the application server-side, never trusted from the client.
 * Data:   inserts application_co_applicants (incl. the encrypted id_number + its lookup hash so the person can be LINKED to
 *         the application at promotion), bumps applications.co_applicants_count, emails the invitee a link.
 * Notes:  id_number goes through idNumberColumns (ciphertext + RAW-derived lookup hash) and is never logged.
 *         The invite email is best-effort, and WHICH invite is `inviteRoute`'s (walker F1, 2026-10-01): a company's
 *         director surety gets director_invited on a 14-day link, any other juristic surety gets NOTHING (held, R3 +
 *         the F7 ruling: a trustee or CC member too), everyone else co_applicant_invited. Until then this route sent joint-rental copy to all.
 */
/* eslint-disable pleks/require-org-scope-on-service-write -- ⚠ THE WEAKEST OF THE EIGHT APPLY-FLOW ROUTES, and recorded as such rather than waved through with its siblings. The other seven verify a token bound to THIS application id before writing; this one has no token at all — the header states the design outright, "the application id in the path is the capability", so possession of the UUID IS the credential. That is a deliberate, pre-existing decision (public apply flow, rate-limited per IP, org_id read server-side and never trusted from the client) and not something to change in a lint-alignment commit. It is also one letter away from the class that produced the 2026-08-22 consent IDOR, where a caller-supplied id with no ownership proof was the whole defect. Flagged for CD; org scoping is not the fix here, a capability token would be. */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { idNumberColumns } from "@/lib/crypto/idNumber"
import { inviteRoute } from "@/lib/applications/juristicParties"
import { sendDirectorInvite, directorTokenExpiry } from "@/lib/applications/directorInvite"

/** Stage 2 has been offered and not yet paid — a party added now joins the open consent round. */
const STAGE2_OPEN = new Set(["invited", "pending_consent", "pending_payment"])

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
    .select("org_id, co_applicants_count, entity_type, applicant_type, company_info, stage2_status")
    .eq("id", applicationId)
    .single()
    logQueryError("POST applications", applicationError)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  const role = body.role === "guarantor" ? "guarantor" : "co_applicant"
  // P1-R7a: the applicant's answer to "is this person a director / trustee / member?", asked only of a juristic
  // surety. A boolean on a guarantor or nothing — NULL is "never asked", which every sender holds like "no".
  const declaredDirector = role === "guarantor" && typeof body.declared_director === "boolean" ? body.declared_director : null
  const route = inviteRoute({
    party: { role, is_surety_director: false, declared_director: declaredDirector },
    application,
  })

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
      // idNumberColumns bundles the ciphertext + the RAW-derived lookup hash — the canonical write
      // helper, so the hash name never appears under app/ (pleks/no-id-number-hash-in-app).
      ...idNumberColumns(body.id_number),
      role,
      declared_director: declaredDirector,
      // The director copy states a 14-day link; the column default is the co-applicant's 30.
      ...(route === "director" ? { access_token_expires: directorTokenExpiry() } : {}),
      // BUILD_72 P1-R8b-2: a residential party added AFTER the stage-2 invite went out (sendShortlistInvitation, which
      // sets stage2_status 'invited' — NOT the stage-1 triage mark, which invites nobody) is invited to stage 2 by this
      // very invite: the shortlist already ran, so this is the only moment its consent window can start.
      ...(route === "co_applicant" && STAGE2_OPEN.has(application.stage2_status as string) ? { stage2_invited_at: new Date().toISOString() } : {}),
    })
    .select("id, access_token")
    .single()

  if (error || !coApplicant) {
    // 23505 = uq_co_applicants_live_surety_email or uq_co_applicants_live_id_hash. A second SURETY line
    // for the same person on the same application is a second screening fee and a second invitation
    // email (M-116); the same ID twice in any role is one human entered twice (BUILD_72 R1-b). Translated here because a raw Postgres message reaching an applicant as a 500 is
    // both unhelpful and a schema leak.
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "That person is already on this application.", code: "duplicate_party" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }

  // Update application. all_complete_notified_at → null re-arms the all-green "ready to submit" fan-out (14R step 7):
  // a newly-added co re-opens the roster, so a group that was previously all-green can legitimately reach it again.
  await supabase.from("applications").update({
    has_co_applicant: true,
    co_applicants_count: (application.co_applicants_count || 0) + 1,
    all_complete_notified_at: null,
  }).eq("id", applicationId)

  // Send the invitation inviteRoute names — or none, for a held surety (the agent page shows the hold).
  try {
    if (route === "director") {
      void sendDirectorInvite({
        orgId: application.org_id, applicationId, coApplicantId: coApplicant.id, token: coApplicant.access_token,
        directorEmail: body.email, directorFirstName: body.first_name || "Director",
      })
    }
    const ctx = route === "co_applicant" ? await buildEmailContext(applicationId) : null
    if (ctx) {
      const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
      void sendCoApplicantInvited(
        { firstName: body.first_name, email: body.email },
        ctx.listingSummary,
        ctx.orgContext,
        { accessToken: coApplicant.access_token, primaryApplicantName: primaryName }
      )
    }
  } catch (e) { console.error("co-applicant invite failed:", e) }

  return NextResponse.json({ ok: true, coApplicantId: coApplicant.id, invite: route })
}
