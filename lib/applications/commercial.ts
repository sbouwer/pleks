/**
 * lib/applications/commercial.ts — Server actions for commercial (juristic) application flow
 *
 * Auth:   applicant token (public portal) or service role for cron/webhook callers
 * Data:   application_directors, application_co_applicants, application_screening_payments
 * Notes:  Commercial applications have 1 company line + N surety-director lines.
 *         Each line is independent: own payment, own consent, own token, own results.
 *         Surety directors use application_co_applicants with is_surety_director = true.
 *         D-14B-01: directors must consent individually — no proxy consent.
 *         D-14B-05: replace-director refund is flagged for manual processing by agent (14C).
 *         orgId and the per-director fee are BOTH derived server-side and are not parameters —
 *         see resolveApplicationOrg below and M-115. Do not reintroduce either as an argument.
 */
"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { APPLICATION_FEE_CENTS } from "@/lib/constants"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { buildDirectorInviteElement } from "@/lib/applications/commercial-emails"
import { verifyApplicantToken } from "@/lib/applications/verifyApplicantToken"
import { idNumberColumns } from "@/lib/crypto/idNumber"

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

export interface DirectorDeclaration {
  firstName: string
  lastName: string
  idNumber?: string
  email: string
  phone?: string
  isSigningSurety: boolean
  /**
   * Director 1 — the primary contact, who is already inside the flow (14G §3.4(5)). Their surety
   * co-applicant row is created exactly like anyone else's; only the invitation email is skipped,
   * because emailing "here is your private link" to the person who just submitted the form reads as
   * a phishing test. It suppresses ONE side effect and nothing else — in particular it grants no
   * rights and skips no gate, so a caller lying about it gains nothing but a missing email.
   */
  isPrimaryContact?: boolean
}

interface DeclareDirectorsResult {
  directors: Array<{ directorId: string; coApplicantId?: string }>
  invited: number
}

/**
 * Creates application_directors rows for all declared directors.
 * For surety directors, also creates an application_co_applicants row and sends an invite.
 * Called from Step 1.5 of the commercial application flow — WIRED on 2026-09-08 via
 * `app/api/applications/director-declaration/route.ts`, which is why the `@knipignore` that stood
 * here is gone: the tag existed only because nothing reached this function, and knip now finds a
 * caller. That route's gate is deliberately NARROWER than this one's — it accepts the lead
 * application token only, while `verifyApplicantToken` below also accepts a co-applicant's
 * access_token (the 14R peer model). Any new caller must decide which of the two it wants.
 *
 * The caller-supplied-orgId hazard this docstring used to warn about was CLOSED on 2026-09-08: the
 * org is now derived from the token-verified application. This was the most dangerous of the three
 * functions here, because its org_id reached INSERTs with nothing pinning the row first — a caller
 * could stamp new director and co-applicant rows into any org on the platform.
 */
export async function declareDirectors(
  applicationId: string,
  directors: DirectorDeclaration[],
  token: string,
): Promise<DeclareDirectorsResult> {
  const service = await createServiceClient()

  // Auth + scope in one step. Gate-before-wiring — unwired today; when wired to the commercial flow
  // (Step 1.5), this blocks unauthenticated director declaration for an arbitrary application.
  const orgId = await resolveApplicationOrg(service, token, applicationId)
  if (!orgId) {
    return { directors: [], invited: 0 }
  }

  const results: DeclareDirectorsResult["directors"] = []
  let invited = 0

  for (const director of directors) {
    // Create application_directors row (full declared list — including non-surety)
    const { data: directorRow, error: dirErr } = await service
      .from("application_directors")
      .insert({
        org_id:       orgId,
        application_id: applicationId,
        first_name:   director.firstName,
        last_name:    director.lastName,
        ...idNumberColumns(director.idNumber), // encrypted at rest + lookup hash (was raw, no hash)
        email:        director.email,
        phone:        director.phone ?? null,
        is_signing_surety: director.isSigningSurety,
      })
      .select("id")
      .single()

    if (dirErr || !directorRow) {
      console.error("declareDirectors — insert director failed:", dirErr?.message)
      continue
    }

    if (!director.isSigningSurety) {
      results.push({ directorId: directorRow.id })
      continue
    }

    // Create co-applicant row for surety director
    const tokenExpires = new Date(Date.now() + DIRECTOR_TOKEN_TTL_DAYS * 86_400_000).toISOString()
    const { data: coApp, error: coErr } = await service
      .from("application_co_applicants")
      .insert({
        org_id:                 orgId,
        primary_application_id: applicationId,
        first_name:             director.firstName,
        last_name:              director.lastName,
        applicant_email:        director.email,
        applicant_phone:        director.phone ?? null,
        ...idNumberColumns(director.idNumber), // encrypted at rest + lookup hash (matches the apply-flow co-applicant writes)
        is_surety_director:     true,
        // Derived from the SSOT, never supplied (M-115). This column is read back as `expectedCents`
        // by the PayFast director webhook, so a caller-supplied value would be both the amount
        // charged AND the amount its own mismatch detector validates against — reconciling clean.
        individual_fee_cents:   APPLICATION_FEE_CENTS,
        access_token_expires:   tokenExpires,
      })
      .select("id, access_token")
      .single()

    if (coErr || !coApp) {
      console.error("declareDirectors — insert co_applicant failed:", coErr?.message)
      results.push({ directorId: directorRow.id })
      continue
    }

    // Back-link director row to co-applicant
    await service
      .from("application_directors")
      .update({ co_applicant_id: coApp.id })
      .eq("id", directorRow.id)
      .eq("org_id", orgId) // org-scope guard (caller-ID census)

    // Send invitation email — except to the primary contact, who is already in the flow (14G §3.4(5)).
    // `invited` counts emails SENT, not surety rows created, so the two diverge here by design: the
    // caller uses it to tell the applicant how many people were contacted.
    if (!director.isPrimaryContact) {
      await sendDirectorInvite({
        orgId,
        applicationId,
        coApplicantId: coApp.id,
        token: coApp.access_token,
        directorEmail: director.email,
        directorFirstName: director.firstName,
      })
      invited++
    }

    results.push({ directorId: directorRow.id, coApplicantId: coApp.id })
  }

  return { directors: results, invited }
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

export interface ReplacementDirector {
  firstName: string
  lastName: string
  idNumber?: string
  email: string
  phone?: string
}

/**
 * Replaces a declined director:
 * 1. Marks old co-applicant row as declined_at = now(), decline_reason = 'replaced'
 * 2. Flags any existing payment for manual refund (14C handles disbursement)
 * 3. Creates new application_directors + application_co_applicants rows
 * 4. Sends invite to replacement director
 * @knipignore See declareDirectors above. Additionally touches application_screening_payments and a
 * manual-refund flag; the caller-supplied-orgId hazard it shared was closed at the same time.
 */
export async function replaceDirector(
  oldCoApplicantId: string,
  applicationId: string,
  replacement: ReplacementDirector,
  token: string,
): Promise<{ ok: boolean; newCoApplicantId?: string; error?: string }> {
  const service = await createServiceClient()

  // Auth + scope (gate-before-wiring — unwired today).
  const orgId = await resolveApplicationOrg(service, token, applicationId)
  if (!orgId) {
    return { ok: false, error: "Invalid or expired token" }
  }

  // Mark old line as declined
  const { error: declineErr } = await service
    .from("application_co_applicants")
    .update({ declined_at: new Date().toISOString(), decline_reason: "replaced" })
    .eq("id", oldCoApplicantId)
    .eq("primary_application_id", applicationId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .is("declined_at", null)

  if (declineErr) {
    return { ok: false, error: "Failed to decline original director line" }
  }

  // Flag any existing payment for manual refund (14C will surface this to agent)
  const { data: existingPayment, error: existingPaymentError } = await service
    .from("application_screening_payments")
    .select("id, fee_cents, paid_at")
    .eq("application_id", applicationId)
    .eq("subject_type", "co_applicant")
    .eq("subject_id", oldCoApplicantId)
    .maybeSingle()
    logQueryError("replaceDirector application_screening_payments", existingPaymentError)

  if (existingPayment?.paid_at) {
    const { error: refundFlagErr } = await service
      .from("application_screening_payments")
      .update({ refund_amount_cents: existingPayment.fee_cents })
      .eq("id", existingPayment.id)
      .eq("org_id", orgId)
    if (refundFlagErr) {
      console.error("replaceDirector — failed to flag refund:", refundFlagErr.message)
    }
  }

  // Create replacement director declaration
  const { data: newDir, error: dirErr } = await service
    .from("application_directors")
    .insert({
      org_id:            orgId,
      application_id:    applicationId,
      first_name:        replacement.firstName,
      last_name:         replacement.lastName,
      ...idNumberColumns(replacement.idNumber), // encrypted at rest + lookup hash (was raw, no hash)
      email:             replacement.email,
      phone:             replacement.phone ?? null,
      is_signing_surety: true,
    })
    .select("id")
    .single()

  if (dirErr || !newDir) {
    return { ok: false, error: "Failed to create replacement director record" }
  }

  // Create co-applicant row for replacement
  const tokenExpires = new Date(Date.now() + DIRECTOR_TOKEN_TTL_DAYS * 86_400_000).toISOString()
  const { data: newCoApp, error: coErr } = await service
    .from("application_co_applicants")
    .insert({
      org_id:                 orgId,
      primary_application_id: applicationId,
      first_name:             replacement.firstName,
      last_name:              replacement.lastName,
      applicant_email:        replacement.email,
      applicant_phone:        replacement.phone ?? null,
      ...idNumberColumns(replacement.idNumber), // encrypted at rest + lookup hash (matches apply-flow co-applicant writes)
      is_surety_director:     true,
      individual_fee_cents:   APPLICATION_FEE_CENTS, // SSOT, never supplied (M-115) — see declareDirectors
      access_token_expires:   tokenExpires,
    })
    .select("id, access_token")
    .single()

  if (coErr || !newCoApp) {
    return { ok: false, error: "Failed to create replacement co-applicant row" }
  }

  // Back-link director to co-applicant
  await service
    .from("application_directors")
    .update({ co_applicant_id: newCoApp.id })
    .eq("id", newDir.id)
    .eq("org_id", orgId)

  // Send invite to replacement
  await sendDirectorInvite({
    orgId,
    applicationId,
    coApplicantId: newCoApp.id,
    token: newCoApp.access_token,
    directorEmail: replacement.email,
    directorFirstName: replacement.firstName,
  })

  return { ok: true, newCoApplicantId: newCoApp.id }
}

// Email element builders live in commercial-emails.tsx — plain sync functions
// cannot be exported from a "use server" file (Turbopack requires all exports to be async).
