/**
 * lib/applications/commercial.ts — Server actions for commercial (juristic) application flow
 *
 * Auth:   applicant token (public portal) or service role for cron/webhook callers
 * Data:   application_co_applicants, application_tokens, applications (read)
 * Notes:  What remains is the surety-invite RESEND (`resendDirectorInvite`, reached by the co-parties
 *         roster's button) and the invite send it shares. D-14B-01: each surety consents individually.
 *         RETIRED 2026-10-01 (BUILD_72 Phase 1, R1): `declareDirectors` and `replaceDirector`, with the
 *         /apply/[slug]/directors page, its form and the director-declaration route. The roster ("A guarantor /
 *         surety") is the one surety surface; the CIPC pull becomes the first writer of application_directors.
 *         orgId is derived server-side and is not a parameter — see resolveApplicationOrg and M-115.
 */
"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { buildDirectorInviteElement } from "@/lib/applications/commercial-emails"
import { verifyApplicantToken } from "@/lib/applications/verifyApplicantToken"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"

const DIRECTOR_TOKEN_TTL_DAYS = 14

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

interface InviteContext {
  orgId: string
  applicationId: string
  coApplicantId: string
  token: string
  directorEmail: string
  directorFirstName: string
}

async function sendDirectorInvite(ctx: InviteContext): Promise<void> {
  const service = await createServiceClient()

  // Get application + listing context for email copy
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("first_name, last_name, listings(public_slug, units(unit_number, properties(name, address_line1, city)))")
    .eq("id", ctx.applicationId)
    .single()

  if (appErr || !app) {
    console.error("sendDirectorInvite — could not fetch application:", appErr?.message)
    return
  }

  const listing = app.listings as unknown as {
    public_slug: string
    units: { unit_number: string; properties: { name: string; address_line1: string | null; city: string | null } }
  } | null

  const propertyLabel = listing
    ? [listing.units?.unit_number, listing.units?.properties?.name].filter(Boolean).join(" — ")
    : "the property"
  const propertyAddress = listing?.units?.properties
    ? [listing.units.properties.address_line1, listing.units.properties.city].filter(Boolean).join(", ")
    : ""
  const primaryContactName = [app.first_name, app.last_name].filter(Boolean).join(" ") || "the applicant"

  const slug = listing?.public_slug ?? ctx.applicationId
  const portalUrl = absoluteUrl(`/apply/${slug}/director-portal/${ctx.token}`)

  const orgSettings = await fetchOrgSettings(ctx.orgId)
  const branding = buildBranding(orgSettings)

  await sendEmail({
    orgId: ctx.orgId,
    templateKey: "application.director_invited",
    to: { email: ctx.directorEmail, name: ctx.directorFirstName },
    subject: `${primaryContactName}'s application — your portion to complete`,
    emailElement: buildDirectorInviteElement({
      directorFirstName: ctx.directorFirstName,
      primaryContactName,
      propertyLabel,
      propertyAddress,
      portalUrl,
      ttlDays: DIRECTOR_TOKEN_TTL_DAYS,
      branding,
    }),
    entityType: "application_co_applicant",
    entityId: ctx.coApplicantId,
    triggerEventType: "director_invite",
    triggerEventId: ctx.applicationId,
  })
}

/**
 * Regenerates a director's token and re-sends the invite email.
 * Called from the primary contact's "Resend invitation" button.
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

  const tokenExpires = new Date(Date.now() + DIRECTOR_TOKEN_TTL_DAYS * 86_400_000).toISOString()
  const newToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")

  const { data: coApp, error } = await service
    .from("application_co_applicants")
    .update({
      access_token:         newToken,
      access_token_expires: tokenExpires,
    })
    .eq("id", coApplicantId)
    .eq("primary_application_id", applicationId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .is("declined_at", null)
    .select("applicant_email, first_name")
    .single()

  if (error || !coApp) {
    return { ok: false, error: "Director not found or already declined" }
  }

  await sendDirectorInvite({
    orgId,
    applicationId,
    coApplicantId,
    token: newToken,
    directorEmail: coApp.applicant_email,
    directorFirstName: coApp.first_name ?? "Director",
  })

  return { ok: true }
}

// Email element builders live in commercial-emails.tsx — plain sync functions
// cannot be exported from a "use server" file (Turbopack requires all exports to be async).
