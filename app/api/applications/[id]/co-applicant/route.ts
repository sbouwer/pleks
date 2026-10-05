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
 *         The invite email is best-effort, and WHICH invite is `inviteRoute`'s (walker F1, 2026-10-01): a juristic
 *         surety gets director_invited — but only once stage 2 is open; before that the shortlist invites it (14W §0b)
 *         — a held surety gets NOTHING, everyone else co_applicant_invited (their stage-1 detail invite).
 *         Once stage 2 is open the invite starts the party's window, so it is the party's 14X N1 and is written to
 *         screening_notification_events (one row per attempt).
 */
/* Was a file-level `eslint-disable pleks/require-org-scope-on-service-write`; every write below now carries
   `.eq("org_id", …)` (14W §0b), so the rule has nothing to suppress. The reasoning stands as a note: ⚠ THE WEAKEST OF THE EIGHT APPLY-FLOW ROUTES, and recorded as such rather than waved through with its siblings. The other seven verify a token bound to THIS application id before writing; this one has no token at all — the header states the design outright, "the application id in the path is the capability", so possession of the UUID IS the credential. That is a deliberate, pre-existing decision (public apply flow, rate-limited per IP, org_id read server-side and never trusted from the client) and not something to change in a lint-alignment commit. It is also one letter away from the class that produced the 2026-08-22 consent IDOR, where a caller-supplied id with no ownership proof was the whole defect. Flagged for CD; org scoping is not the fix here, a capability token would be. */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { idNumberColumns } from "@/lib/crypto/idNumber"
import { inviteRoute, suretyInviteRole } from "@/lib/applications/juristicParties"
import { sendDirectorInvite, directorTokenExpiry } from "@/lib/applications/directorInvite"
import type { SendEmailResult } from "@/lib/comms/send-email"
import { deadlineAsStated } from "@/lib/screening/notificationSchedule"
import { recordTrail } from "@/lib/screening/notificationTrail"

/** Stage 2 is running — a party added now is invited to it by this add (14W §0b). Under §0 each party pays its own
 *  line, so the LEAD's payment (→ screening_in_progress) no longer closes the round; it was the pooled model's "not yet
 *  paid" set, and two of its three members (pending_consent, pending_payment) have no writer (walker 14w-s0b F2). */
const STAGE2_OPEN = new Set(["invited", "screening_in_progress"])

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
  const invitee = { party: { role, is_surety_director: false, declared_director: declaredDirector }, application }
  const route = inviteRoute(invitee)
  const suretyRole = suretyInviteRole(invitee)
  // A surety's invite IS the stage-2 consent + pay invite (no surety stage-1 step exists), so it goes out only once
  // stage 2 is open; before that the shortlist sends it (14W §0b, §9 row 40). A co party's declaration email is its
  // stage-1 detail invite and keeps its timing; it starts the stage-2 clock only when stage 2 is already open.
  const stage2Open = route !== "held" && STAGE2_OPEN.has(application.stage2_status as string)

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
      // The surety copy states the screening window; the column default is the co-applicant's 30.
      ...(route === "surety" ? { access_token_expires: directorTokenExpiry() } : {}),
      // stage2_invited_at is NOT written here: it is stamped below only once the invite was sent (walker 14w-s0b F5).
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
  }).eq("id", applicationId).eq("org_id", application.org_id) // org read server-side above, never from the client

  // Send the invitation inviteRoute names — or none, for a held surety (the agent page shows the hold).
  // T0 is fixed before the send, so the D its N1 row records is the D the stamp below starts (as the shortlist does).
  const invitedAt = new Date()
  let attempt: InviteAttempt = null
  try {
    attempt = await sendInvite(route, suretyRole, stage2Open, {
      orgId: application.org_id, applicationId, coApplicantId: coApplicant.id, token: coApplicant.access_token,
      email: body.email, firstName: body.first_name,
    })
  } catch (e) { console.error("co-applicant invite failed:", e) }
  const sent = !!attempt?.sent?.success

  // ADDENDUM_14X §3: once stage 2 is open this invite IS the party's N1 — the only other place a window starts besides
  // the shortlist (walker 14x F4). One row per attempt, sent or failed. Best-effort like the send itself: the party is
  // already added, so a trail failure is reported, never turned into a failed add.
  if (stage2Open && attempt) await trailN1(supabase, application.org_id, applicationId, coApplicant.id, invitedAt, attempt)

  // BUILD_72 P1-R8b-2 + 14W §0b: a party added AFTER the stage-2 invite went out (sendShortlistInvitation, which sets
  // stage2_status 'invited' — NOT the stage-1 triage mark, which invites nobody) is invited to stage 2 by this very
  // invite: the shortlist already ran, so this is the only moment its window can start. A surety too — its own line,
  // its own T0 (§9 row 10). Stamped only after the send SUCCEEDED, as the shortlist does (walker 14w-s0b F5): a clock
  // started on a failed send runs down a window the party was never told about.
  if (stage2Open && sent) {
    const { error: stampError } = await supabase.from("application_co_applicants").update({
      stage2_invited_at: invitedAt.toISOString(),
      ...(route === "surety" ? { access_token_expires: directorTokenExpiry(invitedAt.getTime()) } : {}),
    }).eq("id", coApplicant.id).eq("org_id", application.org_id).is("stage2_invited_at", null)
    logQueryError("POST application_co_applicants stage2_invited_at", stampError)
  }

  return NextResponse.json({ ok: true, coApplicantId: coApplicant.id, invite: route })
}

/** An invite that was attempted: the key it went out on and the send's result (null = the sender could not read the
 *  application, a failed attempt). Null overall = nothing was attempted. */
type InviteAttempt = { templateKey: string; sent: SendEmailResult | null } | null

async function trailN1(
  db: Awaited<ReturnType<typeof createServiceClient>>, orgId: string, applicationId: string, coApplicantId: string,
  invitedAt: Date, attempt: NonNullable<InviteAttempt>,
): Promise<void> {
  try {
    await recordTrail(db, {
      orgId, applicationId, subject: { subjectType: "co_applicant", subjectId: coApplicantId },
      milestone: "N1", templateKey: attempt.templateKey, deadlineAsStated: deadlineAsStated(invitedAt.toISOString()),
      sent: attempt.sent,
    })
  } catch (e) { console.error("co-applicant N1 trail failed:", e instanceof Error ? e.message : e) }
}

/** The one invite inviteRoute names, awaited. A surety is sent nothing before stage 2 opens (the shortlist invites
 *  it); a co party's invite is its stage-1 detail invite whenever it is added. */
async function sendInvite(
  route: ReturnType<typeof inviteRoute>, suretyRole: ReturnType<typeof suretyInviteRole>, stage2Open: boolean,
  p: { orgId: string; applicationId: string; coApplicantId: string; token: string; email: string; firstName: string },
): Promise<InviteAttempt> {
  if (route === "surety") {
    if (!suretyRole || !stage2Open) return null
    const sent = await sendDirectorInvite({
      orgId: p.orgId, applicationId: p.applicationId, coApplicantId: p.coApplicantId, token: p.token,
      directorEmail: p.email, directorFirstName: p.firstName || "there", role: suretyRole,
    })
    return { templateKey: "application.director_invited", sent }
  }
  if (route !== "co_applicant") return null
  const ctx = await buildEmailContext(p.applicationId)
  if (!ctx) return { templateKey: "application.co_applicant_invited", sent: null }
  const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
  const sent = await sendCoApplicantInvited(
    { firstName: p.firstName, email: p.email }, ctx.listingSummary, ctx.orgContext,
    { accessToken: p.token, primaryApplicantName: primaryName },
  )
  return { templateKey: "application.co_applicant_invited", sent }
}
