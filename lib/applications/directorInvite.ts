/**
 * lib/applications/directorInvite.ts — sends the director-audience surety invite (`application.director_invited`)
 *
 * Auth:   none of its own — a server-only helper. Every caller has already established the application and its
 *         org: the roster route reads org_id from the application row, and `resendDirectorInvite` from the
 *         token-verified application.
 * Data:   applications + listing (read, for copy), org settings (branding); writes communication_log via sendEmail
 * Notes:  NOT a "use server" module, deliberately. It takes `orgId` as a parameter; exported from a "use server"
 *         file it would be a client-callable action with a caller-supplied write scope — the 2026-07-06 IDOR shape.
 *         Who may receive this copy is `inviteRoute` (juristicParties.ts), never this function: it sends what it is
 *         asked to send. Moved out of commercial.ts 2026-10-01 so the roster's first invite could reach it.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding, type SendEmailResult } from "@/lib/comms/send-email"
import { buildDirectorInviteElement } from "@/lib/applications/commercial-emails"
import { absoluteUrl } from "@/lib/routing/absoluteUrl"

/** The director link's life. The copy states it ("This link expires in N days"), so the row's expiry must match. */
const DIRECTOR_TOKEN_TTL_DAYS = 14

export function directorTokenExpiry(now = Date.now()): string {
  return new Date(now + DIRECTOR_TOKEN_TTL_DAYS * 86_400_000).toISOString()
}

export interface DirectorInviteContext {
  orgId: string
  applicationId: string
  coApplicantId: string
  token: string
  directorEmail: string
  directorFirstName: string
}

/** Null when the application could not be read — nothing was sent. */
export async function sendDirectorInvite(ctx: DirectorInviteContext): Promise<SendEmailResult | null> {
  const service = await createServiceClient()

  // Get application + listing context for email copy
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("first_name, last_name, listings(public_slug, units(unit_number, properties(name, address_line1, city)))")
    .eq("id", ctx.applicationId)
    .eq("org_id", ctx.orgId)
    .single()

  if (appErr || !app) {
    console.error("sendDirectorInvite — could not fetch application:", appErr?.message)
    return null
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

  return sendEmail({
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
