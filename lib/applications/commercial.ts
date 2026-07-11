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
 */
"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { buildDirectorInviteElement } from "@/lib/applications/commercial-emails"
import { verifyApplicantToken } from "@/lib/applications/verifyApplicantToken"
import { idNumberColumns } from "@/lib/crypto/idNumber"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"

const DIRECTOR_TOKEN_TTL_DAYS = 14

export interface DirectorDeclaration {
  firstName: string
  lastName: string
  idNumber?: string
  email: string
  phone?: string
  isSigningSurety: boolean
  feeCents: number
}

interface DeclareDirectorsResult {
  directors: Array<{ directorId: string; coApplicantId?: string }>
  invited: number
}

/**
 * Creates application_directors rows for all declared directors.
 * For surety directors, also creates an application_co_applicants row and sends an invite.
 * Called from Step 1.5 of the commercial application flow.
 */
export async function declareDirectors(
  applicationId: string,
  orgId: string,
  directors: DirectorDeclaration[],
  token: string,
): Promise<DeclareDirectorsResult> {
  const service = await createServiceClient()

  // Auth: applicant token bound to this application. Gate-before-wiring — unwired today; when wired to the
  // commercial flow (Step 1.5), this blocks unauthenticated director declaration for an arbitrary application.
  if (!(await verifyApplicantToken(service, token, applicationId))) {
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
        individual_fee_cents:   director.feeCents,
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

    // Send invitation email
    await sendDirectorInvite({
      orgId,
      applicationId,
      coApplicantId: coApp.id,
      token: coApp.access_token,
      directorEmail: director.email,
      directorFirstName: director.firstName,
    })

    results.push({ directorId: directorRow.id, coApplicantId: coApp.id })
    invited++
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
  orgId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const service = await createServiceClient()

  // Auth: the primary applicant's token bound to this application (was ungated — anyone with a valid
  // (coApplicantId, applicationId) pair could regenerate a director's access_token, invalidating the live
  // invite link (DoS) and re-firing the invite email).
  if (!(await verifyApplicantToken(service, token, applicationId))) {
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
  feeCents: number
}

/**
 * Replaces a declined director:
 * 1. Marks old co-applicant row as declined_at = now(), decline_reason = 'replaced'
 * 2. Flags any existing payment for manual refund (14C handles disbursement)
 * 3. Creates new application_directors + application_co_applicants rows
 * 4. Sends invite to replacement director
 */
export async function replaceDirector(
  oldCoApplicantId: string,
  applicationId: string,
  orgId: string,
  replacement: ReplacementDirector,
  token: string,
): Promise<{ ok: boolean; newCoApplicantId?: string; error?: string }> {
  const service = await createServiceClient()

  // Auth: applicant token bound to this application (gate-before-wiring — unwired today).
  if (!(await verifyApplicantToken(service, token, applicationId))) {
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
      individual_fee_cents:   replacement.feeCents,
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
