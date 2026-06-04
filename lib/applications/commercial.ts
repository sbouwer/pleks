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
): Promise<DeclareDirectorsResult> {
  const service = await createServiceClient()

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
        id_number:    director.idNumber ?? null,
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
        id_number:              director.idNumber ?? null,
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
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/apply/${slug}/director-portal/${ctx.token}`

  const orgSettings = await fetchOrgSettings(ctx.orgId)
  const branding = buildBranding(orgSettings)

  const html = buildDirectorInviteHtml({
    directorFirstName: ctx.directorFirstName,
    primaryContactName,
    propertyLabel,
    propertyAddress,
    portalUrl,
    ttlDays: DIRECTOR_TOKEN_TTL_DAYS,
    orgName: branding.orgName,
  })

  await sendEmail({
    orgId: ctx.orgId,
    templateKey: "application.director_invited",
    to: { email: ctx.directorEmail, name: ctx.directorFirstName },
    subject: `${primaryContactName}'s application — your portion to complete`,
    rawHtml: html,
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
): Promise<{ ok: boolean; error?: string }> {
  const service = await createServiceClient()

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
): Promise<{ ok: boolean; newCoApplicantId?: string; error?: string }> {
  const service = await createServiceClient()

  // Mark old line as declined
  const { error: declineErr } = await service
    .from("application_co_applicants")
    .update({ declined_at: new Date().toISOString(), decline_reason: "replaced" })
    .eq("id", oldCoApplicantId)
    .eq("primary_application_id", applicationId)
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
      id_number:         replacement.idNumber ?? null,
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
      id_number:              replacement.idNumber ?? null,
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

// ── HTML email builders ───────────────────────────────────────────────────────

interface DirectorInviteHtmlParams {
  directorFirstName: string
  primaryContactName: string
  propertyLabel: string
  propertyAddress: string
  portalUrl: string
  ttlDays: number
  orgName: string
}

function buildDirectorInviteHtml(p: DirectorInviteHtmlParams): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, sans-serif; color: #111; background: #fff; max-width: 600px; margin: 0 auto; padding: 24px; }
.btn { display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
.notice { background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px; }
p { line-height: 1.6; }
</style></head><body>
<p>Hi ${p.directorFirstName},</p>
<p>${p.primaryContactName} has submitted an application on behalf of their business to lease <strong>${p.propertyLabel}</strong>${p.propertyAddress ? ` (${p.propertyAddress})` : ""}.</p>
<p>You are listed as a director signing personal surety for this lease. Before the application can proceed, you need to complete your own portion — payment, consent, and document upload.</p>
<p>This takes about 10 minutes. Your private link:</p>
<a class="btn" href="${p.portalUrl}">Complete my portion →</a>
<p>This link expires in ${p.ttlDays} days.</p>
<div class="notice">
<strong>A few things to know:</strong><br>
• You will pay a screening fee for your portion (covers credit check, ID verification, income verification, and rental history)<br>
• You will need to upload a recent bank statement (3 months) and your ID document<br>
• The results will be shared with the leasing agent. You also get your own copy by email when complete.<br>
• You are consenting to processing of your personal information under POPIA. Full details on the link page.
</div>
<p>If you do not want to sign personal surety for this lease, you can decline on the link page and we will let ${p.primaryContactName} know to find a replacement.</p>
<p style="color:#666;font-size:13px;">— ${p.orgName} via Pleks</p>
</body></html>`
}

// buildDirectorReminderHtml lives in commercial-html.ts — plain sync functions
// cannot be exported from a "use server" file (Turbopack requires all exports to be async).
