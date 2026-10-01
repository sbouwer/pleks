/**
 * lib/applications/commercial.ts — Server actions for commercial (juristic) application flow
 *
 * Auth:   applicant token (public portal) or service role for cron/webhook callers
 * Data:   application_co_applicants, application_tokens, applications (read)
 * Notes:  What remains is the invite RESEND (`resendDirectorInvite`, reached by the co-parties roster's button).
 *         Its copy is `inviteRoute`'s: director, joint-rental or held (walker F2). The director send itself lives
 *         in directorInvite.ts, outside this "use server" file. D-14B-01: each surety consents individually.
 *         RETIRED 2026-10-01 (BUILD_72 Phase 1, R1): `declareDirectors` and `replaceDirector`, with the
 *         /apply/[slug]/directors page, its form and the director-declaration route. The roster ("A guarantor /
 *         surety") is the one surety surface; the CIPC pull becomes the first writer of application_directors.
 *         orgId is derived server-side and is not a parameter — see resolveApplicationOrg and M-115.
 */
"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { sendDirectorInvite, directorTokenExpiry } from "@/lib/applications/directorInvite"
import { sendCoApplicantInvited } from "@/lib/applications/emails"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { inviteRoute, isJuristicForCopy } from "@/lib/applications/juristicParties"
import { verifyApplicantToken } from "@/lib/applications/verifyApplicantToken"

/**
 * Verifies the applicant credential against this application AND returns the application's own org.
 *
 * These two steps are fused deliberately. Every function below writes rows stamped with an org_id,
 * and until 2026-09-08 that org_id was a PARAMETER — the shape of the 2026-07-06 cross-org IDOR
 * scar, where a caller-supplied identifier was used as the write scope. The token proves which
 * application the caller may act on; the org must therefore be read FROM that application, never
 * accepted alongside it. Returning them from one call means a future caller cannot verify the token
 * and then scope the write to something else.
 *
 * The `applications` read carries no `.eq("org_id", …)` because it is the query that ESTABLISHES
 * org_id — there is nothing to scope it by yet. It is bounded instead by the token check above it,
 * which pins `id` to an application the caller has proven access to. (This file sits in the
 * `require-org-scope-on-service-read` baseline at file level, so the rule would not have flagged
 * this read either way — the reason is recorded here rather than relying on that.)
 */
async function resolveApplicationOrg(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  token: string,
  applicationId: string,
): Promise<string | null> {
  if (!(await verifyApplicantToken(service, token, applicationId))) return null

  const { data, error } = await service
    .from("applications")
    .select("org_id")
    .eq("id", applicationId)
    .maybeSingle()
  logQueryError("resolveApplicationOrg applications", error)

  return data?.org_id ?? null
}

/**
 * Re-sends a party's invite from the primary contact's co-parties "Resend invitation" button.
 *
 * The COPY is `inviteRoute`'s, never this function's (walker F2, 2026-10-01). It used to send director copy to
 * every party the roster lists, which includes residential guarantors (R3a: never director copy) and juristic
 * non-director sureties (R3: held) — and rotating the token on the way killed a residential guarantor's working
 * /apply/co-applicant link. Now:
 *   - director     → rotate the token (and its 14-day expiry, which the copy states), send director_invited
 *   - co_applicant → re-send co_applicant_invited on the EXISTING token, as the reminder cron does (P1-R5)
 *   - held         → send nothing, rotate nothing; the page does not offer the button for a held party
 */
export async function resendDirectorInvite(
  coApplicantId: string,
  applicationId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const service = await createServiceClient()

  // Auth: the primary applicant's token bound to this application (was ungated — anyone with a valid
  // (coApplicantId, applicationId) pair could regenerate a director's access_token, invalidating the live
  // invite link (DoS) and re-firing the invite email). orgId comes from the application, not the caller:
  // this is the one function here with a LIVE caller, and it was passing org_id down through a client
  // component. That was fail-closed (the id filters already pinned the row, so a foreign org matched
  // nothing) — but fail-closed by accident of filter order is not a boundary.
  const orgId = await resolveApplicationOrg(service, token, applicationId)
  if (!orgId) {
    return { ok: false, error: "Invalid or expired token" }
  }

  const [{ data: app, error: appErr }, { data: party, error: partyErr }] = await Promise.all([
    service.from("applications").select("entity_type, applicant_type, company_info")
      .eq("id", applicationId).eq("org_id", orgId).maybeSingle(),
    service.from("application_co_applicants")
      .select("applicant_email, first_name, access_token, role, is_surety_director, declared_director")
      .eq("id", coApplicantId).eq("primary_application_id", applicationId).eq("org_id", orgId)
      .is("declined_at", null).maybeSingle(),
  ])
  logQueryError("resendDirectorInvite applications", appErr)
  logQueryError("resendDirectorInvite application_co_applicants", partyErr)
  if (!app || !party) {
    return { ok: false, error: "Party not found or already declined" }
  }

  const route = inviteRoute({ party, isJuristic: isJuristicForCopy(app) })
  if (route === "held") {
    return { ok: false, error: "This invitation is held until its wording is approved" }
  }

  if (route === "co_applicant") {
    const ctx = await buildEmailContext(applicationId)
    if (!ctx) return { ok: false, error: "Could not send the invitation" }
    const result = await sendCoApplicantInvited(
      { firstName: party.first_name ?? "", email: party.applicant_email },
      ctx.listingSummary, ctx.orgContext,
      { accessToken: party.access_token, primaryApplicantName: [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" "),
        resend: { coApplicantId, triggerEventType: "co_parties_resend", triggerEventId: applicationId } },
    )
    return result.success ? { ok: true } : { ok: false, error: "Could not send the invitation" }
  }

  const newToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")
  const { error } = await service
    .from("application_co_applicants")
    .update({ access_token: newToken, access_token_expires: directorTokenExpiry() })
    .eq("id", coApplicantId)
    .eq("primary_application_id", applicationId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .is("declined_at", null)
  if (error) {
    return { ok: false, error: "Director not found or already declined" }
  }

  const result = await sendDirectorInvite({
    orgId,
    applicationId,
    coApplicantId,
    token: newToken,
    directorEmail: party.applicant_email,
    directorFirstName: party.first_name ?? "Director",
  })
  return result?.success ? { ok: true } : { ok: false, error: "Could not send the invitation" }
}

// Email element builders live in commercial-emails.tsx — plain sync functions
// cannot be exported from a "use server" file (Turbopack requires all exports to be async).
