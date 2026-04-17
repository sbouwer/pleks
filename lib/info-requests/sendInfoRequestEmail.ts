/**
 * Email composition + dispatch for property info requests.
 *
 * Phase 13 ships a minimal HTML body via sendEmail's rawHtml path.
 * The full templated React-Email components + tone variants land in Phase 20.
 */

import { sendEmail, fetchOrgSettings } from "@/lib/comms/send-email"

export type InfoRequestTopic =
  | "landlord" | "insurance" | "broker" | "scheme"
  | "banking"  | "documents" | "compliance" | "other"

export interface SendInfoRequestParams {
  orgId:          string
  requestId:      string
  topic:          InfoRequestTopic
  recipientEmail: string
  token:          string
  propertyId:     string
  isReminder?:    boolean
}

export interface SendResult {
  ok:    boolean
  logId?: string
  error?: string
}

// ── Topic copy ────────────────────────────────────────────────────────────────

const TOPIC_COPY: Record<InfoRequestTopic, { subject: string; ask: string }> = {
  landlord:   { subject: "Owner details needed",     ask: "owner / landlord details" },
  insurance:  { subject: "Insurance details needed", ask: "insurance policy details" },
  broker:     { subject: "Broker details needed",    ask: "broker contact details" },
  scheme:     { subject: "Managing scheme details needed", ask: "managing scheme contact details" },
  banking:    { subject: "Banking details needed",   ask: "banking details for owner statements" },
  documents:  { subject: "Documents needed",         ask: "compliance documents" },
  compliance: { subject: "Compliance details needed", ask: "compliance certificate details" },
  other:      { subject: "Information needed",       ask: "additional property information" },
}

// ── Minimal inline HTML body ─────────────────────────────────────────────────

function buildHtml(opts: {
  agencyName:  string
  ask:         string
  link:        string
  isReminder:  boolean
}): string {
  const heading = opts.isReminder
    ? `Reminder: ${opts.agencyName} needs ${opts.ask}`
    : `${opts.agencyName} needs ${opts.ask}`

  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 24px auto; padding: 24px; color: #18181b; line-height: 1.5;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px;">${heading}</h2>
    <p>${opts.agencyName} is setting up a property in their property management platform and would like to confirm the ${opts.ask}.</p>
    <p>Click the secure link below to fill in the form &mdash; takes about 2 minutes:</p>
    <p style="margin: 24px 0;">
      <a href="${opts.link}" style="background: #18181b; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 500;">Open the form</a>
    </p>
    <p style="font-size: 13px; color: #71717a;">
      The link expires in 14 days. If you'd prefer to send the details directly, just reply to this email.
    </p>
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
    <p style="font-size: 12px; color: #a1a1aa;">
      This message was sent on behalf of ${opts.agencyName} via Pleks. Your information is processed under
      the Protection of Personal Information Act (POPIA).
    </p>
  </body>
</html>`
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function sendInfoRequestEmail(params: SendInfoRequestParams): Promise<SendResult> {
  const orgSettings = await fetchOrgSettings(params.orgId)
  const agencyName = orgSettings?.name ?? "Your property manager"
  const copy = TOPIC_COPY[params.topic] ?? TOPIC_COPY.other

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://pleks.co.za"
  const link = `${baseUrl}/property-info/${params.token}`

  const html = buildHtml({
    agencyName,
    ask:        copy.ask,
    link,
    isReminder: params.isReminder ?? false,
  })

  const subject = params.isReminder
    ? `Reminder — ${copy.subject}`
    : copy.subject

  const result = await sendEmail({
    orgId:       params.orgId,
    templateKey: `info_request.${params.topic}${params.isReminder ? "_reminder" : ""}`,
    to:          { email: params.recipientEmail, name: params.recipientEmail },
    subject,
    rawHtml:     html,
    bodyPreview: `${agencyName} needs ${copy.ask}. Open the secure form: ${link}`,
    entityType:  "property_info_request",
    entityId:    params.requestId,
  })

  return {
    ok:    result.success,
    logId: result.logId,
    error: result.error,
  }
}
